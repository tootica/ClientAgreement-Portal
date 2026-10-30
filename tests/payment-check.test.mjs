import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPaymentConnection} from '../server/payment-check.mjs';

const config={keyId:'rzp_test_example',keySecret:'diagnostic-secret'};
test('connection check uses a read-only request and never returns credentials', async()=>{
  let request;
  const result=await checkPaymentConnection(config,async(url,options)=>{request={url,options};return new Response(JSON.stringify({items:[]}));});
  assert.equal(request.url,'https://api.razorpay.com/v1/orders?count=1');
  assert.equal(request.options.method,undefined);
  assert.equal(request.options.redirect,'error');
  assert.equal(result.ok,true);
  assert.ok(!JSON.stringify(result).includes(config.keySecret));
});
test('connection check distinguishes rejected keys, unavailable provider, bad response and network failure', async()=>{
  for(const status of [401,403]) {
    const result=await checkPaymentConnection(config,async()=>new Response('{}',{status}));
    assert.equal(result.ok,false);
    assert.equal(result.status,status);
    assert.match(result.message,/rejected this key pair/);
  }
  const unavailable=await checkPaymentConnection(config,async()=>new Response('{}',{status:503}));
  assert.equal(unavailable.status,503);
  const malformed=await checkPaymentConnection(config,async()=>new Response('{}'));
  assert.equal(malformed.ok,false);
  const disconnected=await checkPaymentConnection(config,async()=>{throw new Error('Transport details must stay private');});
  assert.equal(disconnected.status,null);
  assert.ok(!JSON.stringify(disconnected).includes('Transport details'));
  assert.equal((await checkPaymentConnection({})).ok,false);
});
