import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../server/config.mjs';
import {normalizeEmail} from '../server/email.mjs';
import {createEmailSender} from '../server/delivery-adapters.mjs';
function fixture() {
  const config=loadConfig({});
  config.email={...config.email,enabled:true,allowTest:true,from:'noreply@tootica.com'};
  config.billing={...config.billing,address:'Approved company address'};
  const invoice=()=>({id:'test-invoice',reference:'INV-100',amount:123400,currency:'INR',environment:'test',state:'paid',customer_name:'Client Name',customer_email:'client@example.com',order_id:'order_test',payment_id:'pay_test',paid_at:1800000000000,billing_snapshot:JSON.stringify({...config.billing,description:'Registration'})});
  return {config,invoice};
}
test('email validation prevents header injection and malformed addresses', () => {
  assert.equal(normalizeEmail(' Client@EXAMPLE.COM '), 'Client@example.com');
  for (const email of ['', null, 'a@b', 'x\r\nBcc:other@example.com', 'two@@example.com', '.bad@example.com', 'a..b@example.com', 'a@-example.com']) assert.equal(normalizeEmail(email), null);
});
test('email adapter attaches a real PDF with a stable message ID and correct recipient', async t => {
  const f = fixture(t); const messages = [];
  const sender = createEmailSender(f.config, {sendMail:async message => {messages.push(message); return {accepted:['client@example.com']};}});
  await sender(f.invoice()); await sender(f.invoice());
  assert.equal(messages[0].to.address, 'client@example.com');
  assert.equal(messages[0].from.address, 'noreply@tootica.com');
  assert.equal(messages[0].messageId, messages[1].messageId);
  assert.match(messages[0].subject, /^\[TEST\]/);
  assert.match(messages[0].text, /INR 1234.00/);
  assert.equal(messages[0].attachments[0].content.subarray(0,5).toString(), '%PDF-');
  assert.equal(messages[0].attachments[0].contentType, 'application/pdf');
});
test('SMTP rejection is retryable but disconnect during DATA is ambiguous', async t => {
  const f = fixture(t);
  for (const [cause, definitive] of [[{responseCode:450},true], [{code:'EAUTH'},true], [{code:'ECONNRESET',command:'DATA'},false]]) {
    const sender = createEmailSender(f.config, {sendMail:async () => {throw cause;}});
    await assert.rejects(sender(f.invoice()), error => error.definitive === definitive);
  }
});
