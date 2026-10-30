import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateConfig, validateOrder, isConfirmedPayment, requestPayment} from '../dist/payment-service.mjs';

const config = {enabled:true, provider:'razorpay', environment:'test', apiBase:'/api/payments', agreementVersion:'v1'};
const order = {orderId:'order_123', keyId:'rzp_test_123', amount:299900, currency:'INR', reference:'INV-123'};
test('shipped configuration cannot collect payments', async () => {
  const shipped = validateConfig(JSON.parse(await readFile(new URL('../dist/payment-config.json', import.meta.url))));
  assert.equal(shipped.enabled, false);
  assert.equal(shipped.environment, 'test');
});
test('payment summary and controls exist with checkout disabled before initialization', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const id of ['payment-amount', 'payment-reference', 'payment-status', 'client-email', 'download-invoice']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /type="email"[^>]*required/);
  assert.match(html, /id="pay-now-button"[^>]*disabled/);
  assert.doesNotMatch(html, /2,999|TOOTICA-REG-2026/);
});
test('rejects external API endpoints and mismatched environment keys', () => {
  for (const apiBase of ['https://other.example/api', '//other.example/api', '/api/../secrets']) assert.throws(() => validateConfig({...config, apiBase}));
  assert.throws(() => validateOrder(order, 'live'));
  for (const amount of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateOrder({...order, amount}, 'test'));
  assert.deepEqual(validateOrder(order, 'test'), order);
});
test('confirmation must match the server order, currency and amount', () => {
  const result = {status:'paid', orderId:order.orderId, amount:order.amount, currency:'INR', paymentId:'pay_123'};
  assert.equal(isConfirmedPayment(result, order), true);
  for (const change of [{status:'authorized'}, {status:'pending'}, {orderId:'order_other'}, {amount:1}, {currency:'USD'}, {paymentId:''}]) assert.equal(isConfirmedPayment({...result, ...change}, order), false);
  assert.equal(isConfirmedPayment({razorpay_payment_id:'pay_123'}, order), false);
});
test('API request preserves idempotency and cookies, never sends a client price', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let received;
    globalThis.fetch = async (url, options) => {
      received = {url, options};
      return new Response(JSON.stringify(order), {headers:{'content-type':'application/json'}});
    };
    const body = {agreement:{accepted:true, signerName:'Client', version:'v1'}};
    assert.deepEqual(await requestPayment(config, '/orders', body, 'stable-key'), order);
    assert.equal(received.url, '/api/payments/orders');
    assert.equal(received.options.credentials, 'same-origin');
    assert.equal(received.options.redirect, 'error');
    assert.equal(received.options.headers['Idempotency-Key'], 'stable-key');
    assert.deepEqual(JSON.parse(received.options.body), body);
    for (const response of [new Response('unavailable', {status:503}), new Response('<html>fallback</html>', {headers:{'content-type':'text/html'}})]) {
      globalThis.fetch = async () => response;
      await assert.rejects(requestPayment(config, '/summary'));
    }
  } finally {globalThis.fetch = originalFetch;}
});
