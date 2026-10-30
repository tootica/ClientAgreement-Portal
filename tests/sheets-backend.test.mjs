import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {loadConfig} from '../server/config.mjs';
import {createSheetsApp} from '../server/sheets-app.mjs';
import {createSheetStore} from '../server/sheets-store.mjs';
import {applySheetAction} from '../server/sheet-state.mjs';
import {memorySheetStore} from './sheets-fixture.mjs';
import {clientDetails} from './client-fixture.mjs';

function fixture() {
  const config=loadConfig({PAYMENTS_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'test-secret',RAZORPAY_WEBHOOK_SECRET:'webhook-secret',SHEETS_STORE_URL:'https://script.google.com/macros/s/fixture/exec',SHEETS_STORE_SECRET:'x'.repeat(64)});
  const {records,store}=memorySheetStore(); let calls=0;
  const provider={payments:[],orders:[],async createOrder(r){calls++;const o={id:'order_fixture',amount:r.amount,currency:r.currency,receipt:r.id};this.orders.push(o);return o;},async findOrdersByReceipt(receipt){return this.orders.filter(o=>o.receipt===receipt);},async getPayments(){return this.payments;},async getPayment(id){return this.payments.find(p=>p.id===id);}};
  const app=createSheetsApp({config,store,provider});let cookie;
  async function request(path,body,extra={}) {
    const r=await app.handle(new Request(config.origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:config.origin}),...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};
  }
  const body={email:clientDetails.email,clientDetails,agreement:{accepted:true,signerName:clientDetails.contactName,version:config.agreementVersion},packageId:'essential'};
  const order=(change={})=>request('/api/payments/orders',{...body,...change},{'Idempotency-Key':'fixture-attempt-123456'});
  async function pay(){await request('/api/payments/session',{});const o=await order();provider.payments=[{id:'pay_fixture',order_id:o.body.orderId,amount:o.body.amount,currency:'INR',status:'captured',captured:true}];return request('/api/payments/verify',{razorpay_order_id:o.body.orderId,razorpay_payment_id:'pay_fixture',razorpay_signature:createHmac('sha256',config.keySecret).update(o.body.orderId+'|pay_fixture').digest('hex')});}
  return {config,records,store,provider,app,request,order,pay,get calls(){return calls;}};
}
test('Sheets checkout restores sessions and prices while preserving started orders',async()=>{
  const f=fixture();assert.equal((await f.request('/api/payments/session',{})).status,200);assert.equal((await f.request('/api/payments/session',{})).status,200);assert.equal(f.records.length,1);
  f.config.registrationAmount=1200000;await f.request('/api/payments/session',{});assert.equal(f.records[0].amount,1200000);
  assert.equal((await f.order()).status,200);assert.equal((await f.order()).status,200);assert.equal(f.calls,1);
  f.config.registrationAmount=1300000;await f.request('/api/payments/session',{});assert.equal(f.records[0].amount,1200000);
  assert.equal((await f.request('/api/payments/summary')).body.detailsLocked,true);
});
test('Sheets checkout rejects tampered price, package, client details and mismatched retry',async()=>{
  const f=fixture();await f.request('/api/payments/session',{});
  for(const change of [{amount:100},{packageId:'practice-plus'},{clientDetails:{...clientDetails,phone:'123'}},{clientDetails:{...clientDetails,email:'invalid'}}])assert.equal((await f.order(change)).status,400);
  assert.equal(f.calls,0);await f.order();assert.equal((await f.order({clientDetails:{...clientDetails,city:'Other'}})).status,409);
});
test('Sheets order claim survives lost responses and only attaches matching receipt',async()=>{
  const f=fixture();await f.request('/api/payments/session',{});const original=f.provider.createOrder.bind(f.provider);
  f.provider.createOrder=async r=>{await original(r);throw new Error('Lost response');};
  assert.equal((await f.order()).status,502);assert.equal(f.records[0].state,'creating');assert.equal((await f.order()).status,200);assert.equal(f.calls,1);
});
test('Sheets auth rejection is safely retryable; ambiguous failure never creates another order',async()=>{
  const f=fixture();await f.request('/api/payments/session',{});f.provider.createOrder=async()=>{const e=new Error('Authentication failed');e.status=401;e.orderNotCreated=true;throw e;};assert.equal((await f.order()).status,401);assert.equal(f.records[0].state,'new');
  f.provider.createOrder=async()=>{throw new Error('Timeout');};await f.order();assert.equal((await f.order()).status,409);assert.equal(f.records[0].state,'creating');
});
test('Sheets signature verification requires capture, ownership and matching amount',async()=>{
  const f=fixture();await f.request('/api/payments/session',{});await f.order();
  assert.equal((await f.request('/api/payments/verify',{})).status,400);
  assert.equal((await f.request('/api/payments/verify',{razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'0'.repeat(64)})).status,400);
  assert.equal(f.records[0].state,'created');assert.equal((await f.pay()).body.status,'paid');
  assert.equal((await f.request('/api/payments/invoice')).body.subarray(0,5).toString(),'%PDF-');
  assert.equal((await f.request('/api/payments/summary')).body.payment.status,'paid');
});
test('Sheets webhooks are signature protected and duplicate capture keeps one record',async()=>{
  const f=fixture();await f.pay();const event={event:'payment.captured',payload:{payment:{entity:f.provider.payments[0]}}};
  assert.equal((await f.request('/api/payments/webhook',event)).status,400);
  const headers={'x-razorpay-signature':createHmac('sha256',f.config.webhookSecret).update(JSON.stringify(event)).digest('hex')};
  assert.equal((await f.request('/api/payments/webhook',event,headers)).status,200);assert.equal((await f.request('/api/payments/webhook',event,headers)).status,200);assert.equal(f.records.length,1);
});
test('Sheets session privacy, cross-origin checks and setup gating fail closed',async()=>{
  const f=fixture();assert.equal((await f.request('/api/payments/summary')).status,401);assert.equal((await f.request('/api/payments/session',{}, {Origin:'https://other.example'})).status,403);
  f.config.sheetStore.url='';assert.equal((await f.request('/payment-config.json')).body.enabled,false);assert.equal((await f.request('/api/payments/session',{})).status,503);
});
test('Sheets email claims prevent duplicates and interrupted sends require review',()=>{
  const records=[{id:'invoice',environment:'test',state:'paid',email_status:'pending',email_attempts:0}];const act=(action,p={},now=1000)=>applySheetAction(records,action,{id:'invoice',environment:'test',...p},now);
  assert.ok(act('email-claim',{claim:'one'}));assert.equal(act('email-claim',{claim:'two'}),null);act('email-next',{},122000);assert.equal(records[0].email_status,'review');assert.equal(act('email-claim',{claim:'three'}),null);
});
test('Sheets email SMTP acceptance is recorded once with a durable retry for rejection',async()=>{
  const f=fixture();await f.pay();f.config.email.enabled=true;f.config.email.allowTest=true;let sends=0;
  const app=createSheetsApp({config:f.config,store:f.store,provider:f.provider,sendEmail:async()=>{sends++;}});
  f.records[0].billing_snapshot=JSON.stringify({address:'Approved billing address'});
  assert.equal(await app.runDeliveries(),1);assert.equal(await app.runDeliveries(),0);assert.equal(sends,1);assert.equal(f.records[0].email_status,'done');
});
test('Sheets RPC signs server-only payloads and sanitizes provider/network errors',async()=>{
  const f=fixture();let envelope;
  const store=createSheetStore(f.config,async(url,options)=>{envelope=JSON.parse(options.body);return Response.json({ok:true,value:{state:'new'}});});
  assert.equal((await store('get',{id:'invoice'})).state,'new');assert.equal(envelope.signature,createHmac('sha256',f.config.sheetStore.secret).update(envelope.packet).digest('hex'));assert.equal(JSON.parse(envelope.packet).payload.environment,'test');
  await assert.rejects(createSheetStore(f.config,async()=>{throw new Error('secret response');})('get'),e=>e.status===503 && !e.message.includes('secret'));
});
