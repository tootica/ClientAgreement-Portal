import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {loadConfig} from '../server/config.mjs';
import {createSheetsApp} from '../server/sheets-app.mjs';
import {createSheetStore} from '../server/sheets-store.mjs';
import {applySheetAction} from '../server/sheet-state.mjs';
import {memorySheetStore} from './sheets-fixture.mjs';
import {clientDetails} from './client-fixture.mjs';

function fixture({sendInvitation,emailEnabled=false,allowTest=true}={}){
  const adminKey='admin-test-key-'.repeat(4);
  const config=loadConfig({PAYMENTS_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_invites',RAZORPAY_KEY_SECRET:'test-secret',RAZORPAY_WEBHOOK_SECRET:'webhook-secret',INVITATIONS_REQUIRED:'true',INVITATION_ADMIN_KEY:adminKey,SHEETS_STORE_URL:'https://script.google.com/macros/s/fixture/exec',SHEETS_STORE_SECRET:'x'.repeat(64)});
  const {records,store}=memorySheetStore();let creates=0;
  config.email.enabled=emailEnabled;config.email.allowTest=allowTest;
  const provider={payments:[],async createOrder(r){creates++;return {id:'order_invitation',receipt:r.id,amount:r.amount,currency:r.currency};},async getPayments(){return this.payments;},async getPayment(){return this.payments[0];}};
  const app=createSheetsApp({config,store,provider,sendInvitation});
  async function request(path,body,{cookie,admin=false,origin=config.origin,key=adminKey}={}){
    const response=await app.handle(new Request(config.origin+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:'Bearer '+key}:{}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':'invite-attempt-123456'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    const isJSON=response.headers.get('content-type')?.includes('json');
    return {status:response.status,body:isJSON?await response.json():Buffer.from(await response.arrayBuffer()),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const invite=(change={})=>request('/api/payments/admin/invitations',{name:clientDetails.contactName,email:clientDetails.email,days:7,...change},{admin:true});
  const open=async(invitation,cookie)=>request('/api/payments/session',{invitationToken:new URL(invitation.body.url).hash.slice('#invite='.length)},{cookie});
  const order=(cookie,details=clientDetails)=>request('/api/payments/orders',{packageId:'essential',email:details.email,clientDetails:details,agreement:{accepted:true,signerName:details.contactName,version:config.agreementVersion}},{cookie});
  return {adminKey,config,records,store,provider,request,invite,open,order,get creates(){return creates;}};
}

test('invitation mode requires a strong configured admin credential',()=>{
  assert.throws(()=>loadConfig({INVITATIONS_REQUIRED:'true'}),/INVITATION_ADMIN_KEY/);
  assert.throws(()=>loadConfig({INVITATION_ADMIN_KEY:'short'}),/INVITATION_ADMIN_KEY/);
});

test('old Apps Script invitation responses explain the required deployment update',async()=>{
  const store=createSheetStore({environment:'test',sheetStore:{url:'https://script.google.com/macros/s/fixture/exec',secret:'x'.repeat(64)}},async()=>Response.json({ok:false,status:401,error:'Your registration session has expired. Reload this page to continue.'}));
  await assert.rejects(store('invitation-list'),error=>error.status===503 && /State.gs/.test(error.message));
  await assert.rejects(store('get',{sessionHash:'expired'}),error=>error.status===401 && /session has expired/.test(error.message));
});

test('creating an invitation emails its exact link once and records delivery without storing the token',async()=>{
  const sent=[];const f=fixture({emailEnabled:true,sendInvitation:async(invitation,url)=>sent.push({invitation,url})});
  const result=await f.invite();assert.equal(result.status,201);assert.equal(result.body.emailDelivery,'sent');
  assert.equal(sent.length,1);assert.equal(sent[0].invitation.email,clientDetails.email);assert.equal(sent[0].url,result.body.url);
  assert.equal(f.records[0].invitation_mail_status,'sent');
  assert.equal(JSON.stringify(f.records).includes(new URL(result.body.url).hash.slice(8)),false);
  await f.request('/api/payments/admin/invitations',undefined,{admin:true});assert.equal(sent.length,1);
});

test('invitation email respects disabled mail and test-mail gating',async()=>{
  for(const settings of [{emailEnabled:false},{emailEnabled:true,allowTest:false}]){
    let calls=0;const f=fixture({...settings,sendInvitation:async()=>calls++});
    const availability=await f.request('/api/payments/admin/invitations',undefined,{admin:true});
    assert.equal(availability.body.invitationEmail.enabled,false);
    assert.equal(availability.body.invitationEmail.reason,settings.emailEnabled?'test-disabled':'disabled');
    const result=await f.invite();assert.equal(result.body.emailDelivery,'disabled');assert.equal(calls,0);assert.equal(f.records.length,1);
  }
});

test('SMTP invitation failures preserve the usable link and distinguish rejection from ambiguity',async()=>{
  for(const definitive of [true,false]){
    let calls=0;const f=fixture({emailEnabled:true,sendInvitation:async()=>{calls++;const error=new Error('SMTP failure');error.definitive=definitive;throw error;}});
    const result=await f.invite();assert.equal(result.status,201);assert.equal(result.body.emailDelivery,definitive?'failed':'review');assert.match(result.body.url,/#invite=/);
    assert.equal((await f.open(result)).status,200);assert.equal(calls,1);
  }
});

test('interrupted invitation sends require review and recorded acceptance cannot be overwritten',()=>{
  const records=[];const payload={environment:'test',id:'mail-invite',reference:'REF',amount:1187000,invitationHash:'hash',email:clientDetails.email,name:'Client',days:1,sendEmail:true};
  applySheetAction(records,'invitation-create',payload,1000);
  assert.equal(applySheetAction(records,'invitation-list',{environment:'test'},1001)[0].emailDelivery,'sending');
  assert.equal(applySheetAction(records,'invitation-list',{environment:'test'},122000)[0].emailDelivery,'review');
  applySheetAction(records,'invitation-mail-finish',{environment:'test',id:'mail-invite',status:'sent'},122001);
  assert.throws(()=>applySheetAction(records,'invitation-mail-finish',{environment:'test',id:'mail-invite',status:'failed'},122002),/already been recorded/);
});

test('admin rejects unauthenticated requests and cross-origin writes without disclosing keys',async()=>{
  const f=fixture();
  assert.equal((await f.request('/api/payments/admin/invitations')).status,401);
  assert.equal((await f.request('/api/payments/admin/invitations',undefined,{admin:true,key:'wrong'})).status,401);
  assert.equal((await f.request('/api/payments/admin/invitations',{name:'Client',email:clientDetails.email,days:7},{admin:true,origin:'https://attacker.example'})).status,403);
  assert.equal(f.records.length,0);
  assert.equal((await f.request('/api/payments/session',{})).status,403);
  const publicConfig=await f.request('/payment-config.json');
  assert.equal(publicConfig.body.invitationRequired,true);
  assert.equal(JSON.stringify(publicConfig.body).includes(f.adminKey),false);
  for(const change of [{email:'invalid'},{days:0},{days:8},{days:1.5},{name:'bad\nname'}])assert.equal((await f.invite(change)).status,400);
});

test('invitations store only hashes, bind email, and cannot be opened in a second browser',async()=>{
  const f=fixture(),invitation=await f.invite();assert.equal(invitation.status,201);
  const token=new URL(invitation.body.url).hash.slice(8);
  assert.equal(token.length,43);
  assert.equal(JSON.stringify(f.records).includes(token),false);
  const listing=await f.request('/api/payments/admin/invitations',undefined,{admin:true});
  assert.equal(listing.body.invitations[0].status,'pending');
  assert.equal(JSON.stringify(listing.body).includes('invitation_hash'),false);
  const first=await f.open(invitation);assert.equal(first.status,200);assert.ok(first.cookie);
  assert.equal((await f.open(invitation,first.cookie)).status,200);
  assert.equal((await f.open(invitation)).status,409);
  const summary=await f.request('/api/payments/summary',undefined,{cookie:first.cookie});
  assert.equal(summary.body.invitedEmail,clientDetails.email);
  assert.equal((await f.order(first.cookie,{...clientDetails,email:'other@example.com'})).status,400);
  assert.equal(f.creates,0);
  assert.equal((await f.order(first.cookie)).status,200);
  assert.equal((await f.order(first.cookie)).status,200);
  assert.equal(f.creates,1);
});

test('revocation invalidates unopened links and existing sessions before checkout',async()=>{
  const f=fixture(),invitation=await f.invite(),first=await f.open(invitation);
  assert.equal((await f.request('/api/payments/admin/invitations/revoke',{id:invitation.body.invitation.id},{admin:true})).status,200);
  assert.equal((await f.open(invitation)).status,403);
  assert.equal((await f.request('/api/payments/summary',undefined,{cookie:first.cookie})).status,403);
  assert.equal((await f.order(first.cookie)).status,403);
  assert.equal(f.creates,0);
});

test('expired invitations cannot open or prepare orders, including a racing revoke',()=>{
  const records=[],base={environment:'test',id:'one',reference:'REF',amount:1187000,invitationHash:'hash',email:clientDetails.email,name:'Client',days:1};
  applySheetAction(records,'invitation-create',base,1000);
  assert.throws(()=>applySheetAction(records,'session',{environment:'test',invitationHash:'hash',newSessionHash:'s'},1000+86400000),/expired/);
  applySheetAction(records,'session',{environment:'test',invitationHash:'hash',newSessionHash:'s'},1001);
  records[0].invitation_revoked=true;
  assert.throws(()=>applySheetAction(records,'prepare',{environment:'test',sessionHash:'s',email:clientDetails.email},1002),/revoked/);
  assert.equal(applySheetAction(records,'invitation-list',{environment:'live'},1002).length,0);
});

test('checkout cannot be revoked; captured payment, invoice and completion remain idempotent',async()=>{
  const f=fixture(),invitation=await f.invite(),first=await f.open(invitation);await f.order(first.cookie);
  assert.equal((await f.request('/api/payments/admin/invitations/revoke',{id:invitation.body.invitation.id},{admin:true})).status,409);
  f.provider.payments=[{id:'pay_invitation',order_id:'order_invitation',amount:1187000,currency:'INR',status:'captured',captured:true}];
  const signature=createHmac('sha256',f.config.keySecret).update('order_invitation|pay_invitation').digest('hex');
  const verify=()=>f.request('/api/payments/verify',{razorpay_order_id:'order_invitation',razorpay_payment_id:'pay_invitation',razorpay_signature:signature},{cookie:first.cookie});
  assert.equal((await verify()).body.status,'paid');assert.equal((await verify()).body.status,'paid');
  assert.equal((await f.open(invitation)).status,409);
  assert.equal((await f.open(invitation,first.cookie)).status,200);
  const pdf=await f.request('/api/payments/invoice',undefined,{cookie:first.cookie});assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');
  assert.equal((await f.request('/api/payments/admin/invitations',undefined,{admin:true})).body.invitations[0].status,'completed');
  assert.equal(f.records.length,1);assert.equal(f.creates,1);
});

test('an old public browser session cannot bypass invitation mode',async()=>{
  const f=fixture();f.config.invitations.required=false;
  const old=await f.request('/api/payments/session',{});
  f.config.invitations.required=true;
  assert.equal((await f.request('/api/payments/session',{}, {cookie:old.cookie})).status,403);
  assert.equal((await f.order(old.cookie)).status,403);
});
