// Public settings only. Prices, invoice ownership and secrets belong on the server.
export function validateConfig(config) {
  if (typeof config.enabled !== 'boolean' || !['test', 'live'].includes(config.environment) || config.provider !== 'razorpay') throw new Error('Invalid payment settings.');
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(config.apiBase) || !config.agreementVersion) throw new Error('Invalid payment API settings.');
  return config;
}

export function validateOrder(order, environment) {
  if (!order || !/^order_[a-zA-Z0-9]+$/.test(order.orderId) || !new RegExp(`^rzp_${environment}_[a-zA-Z0-9]+$`).test(order.keyId) || !Number.isSafeInteger(order.amount) || order.amount <= 0 || !/^[A-Z]{3}$/.test(order.currency) || typeof order.reference !== 'string' || !order.reference.trim()) throw new Error('Invalid payment order.');
  return order;
}

export async function requestPayment(config, path, body, idempotencyKey) {
  const response = await fetch(`${config.apiBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: {Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(idempotencyKey ? {'Idempotency-Key': idempotencyKey} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    let message = 'Payment service unavailable. Please try again or contact Tootica.';
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = await response.json();
        if (typeof body.error === 'string' && body.error.length <= 250) message = body.error;
      } catch { /* Keep the fallback for invalid error bodies. */ }
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function isConfirmedPayment(result, order) {
  return result?.status === 'paid' && result.orderId === order.orderId && result.amount === order.amount && result.currency === order.currency && typeof result.paymentId === 'string' && /^pay_[a-zA-Z0-9]+$/.test(result.paymentId);
}
