import {resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeEmail} from './email.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function loadConfig(env = process.env) {
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://localhost:3001');
  const production = env.NODE_ENV === 'production';
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('PUBLIC_ORIGIN must use HTTP or HTTPS.');
  if (origin.origin !== (env.PUBLIC_ORIGIN || 'http://localhost:3001') || origin.username || origin.password) throw new Error('PUBLIC_ORIGIN must be an origin without a path.');
  if (production && origin.protocol !== 'https:') throw new Error('Production requires an HTTPS PUBLIC_ORIGIN.');
  if (!production && origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('HTTP is allowed only on localhost.');
  const enabled = env.PAYMENTS_ENABLED === 'true';
  const environment = env.PAYMENT_ENVIRONMENT || 'test';
  if (!['test', 'live'].includes(environment)) throw new Error('Invalid PAYMENT_ENVIRONMENT.');
  if (environment === 'live' && !production) throw new Error('Live payments require production mode.');
  let registrationAmount;
  if (env.ESSENTIAL_PRICE_INR?.trim()) {
    const price=env.ESSENTIAL_PRICE_INR.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(price)) throw new Error('ESSENTIAL_PRICE_INR must be rupees without commas, with at most two decimal places.');
    const [rupees,paise='']=price.split('.');
    registrationAmount=Number(rupees)*100+Number(paise.padEnd(2,'0'));
  } else registrationAmount = env.REGISTRATION_AMOUNT_PAISE ? Number(env.REGISTRATION_AMOUNT_PAISE) : environment === 'test' ? 1187000 : null;
  if (registrationAmount !== null && (!Number.isSafeInteger(registrationAmount) || registrationAmount < 100 || registrationAmount > 100000000)) throw new Error(env.ESSENTIAL_PRICE_INR?.trim() ? 'ESSENTIAL_PRICE_INR must be between 1 and 1000000 rupees.' : 'REGISTRATION_AMOUNT_PAISE must be an integer from 100 to 100000000.');
  if (enabled && environment === 'live' && registrationAmount === null) throw new Error('Set your approved ESSENTIAL_PRICE_INR before enabling live registration payments.');
  if (enabled) {
    if (!new RegExp(`^rzp_${environment}_[A-Za-z0-9]+$`).test(env.RAZORPAY_KEY_ID || '')) throw new Error(`RAZORPAY_KEY_ID must be a ${environment}-mode key (rzp_${environment}_...) to match PAYMENT_ENVIRONMENT=${environment}. Use a matching key ID and secret from Razorpay Dashboard, then restart the server.`);
    if (!env.RAZORPAY_KEY_SECRET) throw new Error('RAZORPAY_KEY_SECRET is required before enabling payments. Use the secret belonging to the configured key ID.');
    if (!env.RAZORPAY_WEBHOOK_SECRET) throw new Error('RAZORPAY_WEBHOOK_SECRET is required before enabling payments. Configure the same webhook secret in the server environment and Razorpay Dashboard.');
  }
  const staticDir = resolve(projectRoot, 'dist');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const email = {
    enabled:env.EMAIL_ENABLED === 'true', host:env.SMTP_HOST || '', port:Number(env.SMTP_PORT || 587),
    secure:env.SMTP_SECURE === 'true', user:env.SMTP_USER || '', password:env.SMTP_PASSWORD || '',
    from:env.EMAIL_FROM || '', replyTo:env.EMAIL_REPLY_TO || '',
    allowTest:env.EMAIL_ALLOW_TEST === 'true'
  };
  const billing = {name:env.MERCHANT_NAME || 'Tootica', address:env.INVOICE_COMPANY_ADDRESS || '', taxId:env.INVOICE_TAX_ID || '', fontPath:env.INVOICE_FONT_PATH ? resolve(projectRoot, env.INVOICE_FONT_PATH) : ''};
  if (email.enabled && (!email.host || !Number.isInteger(email.port) || email.port < 1 || email.port > 65535 || !email.user || !email.password || !normalizeEmail(email.from) || (email.replyTo && !normalizeEmail(email.replyTo)) || !billing.address)) throw new Error('Configure SMTP, sender email and company billing address before enabling email.');
  const sheetStore={url:env.SHEETS_STORE_URL || '',secret:env.SHEETS_STORE_SECRET || ''};
  if (sheetStore.url && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(sheetStore.url)) throw new Error('SHEETS_STORE_URL must be the deployed Google Apps Script HTTPS /exec URL.');
  if (sheetStore.secret && sheetStore.secret.length<32) throw new Error('SHEETS_STORE_SECRET must contain at least 32 characters.');
  for (const privatePath of [billing.fontPath].filter(Boolean)) {
    const privateRelative = relative(staticDir, privatePath);
    if (!privateRelative || (!isAbsolute(privateRelative) && privateRelative !== '..' && !privateRelative.startsWith('..' + sep))) throw new Error('Private integration files must be outside dist.');
  }
  return {
    origin:origin.origin, secure:origin.protocol === 'https:', production,
    host:env.HOST || '127.0.0.1', port, staticDir,
    enabled, environment, registrationAmount, keyId:env.RAZORPAY_KEY_ID || '', keySecret:env.RAZORPAY_KEY_SECRET || '', webhookSecret:env.RAZORPAY_WEBHOOK_SECRET || '',
    merchantName:env.MERCHANT_NAME || 'Tootica', description:env.PAYMENT_DESCRIPTION || 'Tootica Essential annual plan (1 year)',
    agreementVersion:env.AGREEMENT_VERSION || 'client-agreement-v1', email, billing, sheetStore
  };
}
