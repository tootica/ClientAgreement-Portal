import {createHmac, timingSafeEqual} from 'node:crypto';
import Razorpay from 'razorpay';

export function validSignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function createRazorpay(config, client) {
  function sdk() {
    if (!client) {
      client = new Razorpay({key_id:config.keyId, key_secret:config.keySecret});
      // The SDK exposes its Axios transport here; bound requests and forbid redirects.
      client.api.rq.defaults.timeout = 15000;
      client.api.rq.defaults.maxRedirects = 0;
    }
    return client;
  }
  async function api(operation) {
    try {return await operation(sdk());}
    catch (cause) {
      // Never expose the SDK error object: it can contain authentication/request data.
      const error = new Error(cause?.statusCode === 401 || cause?.statusCode === 403 ? 'Payment provider authentication failed. Please contact support@tootica.com.' : 'Payment provider request failed. Please try again or contact support@tootica.com.');
      error.status = cause?.statusCode === 401 || cause?.statusCode === 403 ? 401 : 500;
      error.orderNotCreated = [400, 401, 403, 422, 429].includes(cause?.statusCode);
      throw error;
    }
  }
  return {
    createOrder:invoice => api(client => client.orders.create({amount:invoice.amount, currency:invoice.currency, receipt:invoice.id})),
    getOrder:id => api(client => client.orders.fetch(id)),
    getPayment:id => api(client => client.payments.fetch(id)),
    async findOrdersByReceipt(receipt) {
      const result = await api(client => client.orders.all({receipt,count:100}));
      if (!Array.isArray(result.items)) throw new Error('Invalid provider order lookup.');
      return result.items.filter(order => order.receipt === receipt);
    },
    async getPayments(id) {
      const collection = await api(client => client.orders.fetchPayments(id));
      if (!Array.isArray(collection.items)) throw new Error('Invalid provider response.');
      return collection.items;
    }
  };
}
