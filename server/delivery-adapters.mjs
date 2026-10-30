import nodemailer from 'nodemailer';
import {renderInvoice} from './invoice-pdf.mjs';
import {packageName} from '../dist/packages.mjs';

export function createEmailSender(config, transport) {
  const settings = config.email;
  transport ||= nodemailer.createTransport({
    host:settings.host, port:settings.port, secure:settings.secure, requireTLS:!settings.secure,
    auth:{user:settings.user, pass:settings.password},
    connectionTimeout:10000, greetingTimeout:10000, socketTimeout:20000,
    disableFileAccess:true, disableUrlAccess:true
  });
  return async invoice => {
    const attachment = await renderInvoice(invoice, {fontPath:config.billing.fontPath});
    const billing = JSON.parse(invoice.billing_snapshot || '{}');
    const domain = settings.from.split('@')[1];
    const message = {
      from:{name:billing.name || config.merchantName, address:settings.from}, to:{name:invoice.customer_name, address:invoice.customer_email},
      ...(settings.replyTo ? {replyTo:settings.replyTo} : {}),
      messageId:`<tootica-${invoice.id}@${domain}>`,
      subject:(invoice.environment === 'test' ? '[TEST] ' : '') + 'Payment confirmed — Invoice ' + invoice.reference,
      text:`Hello ${invoice.customer_name},\n\nYour payment of INR ${(invoice.amount / 100).toFixed(2)} has been confirmed.${invoice.package_id ? '\nPackage: ' + packageName(invoice.package_id) : ''}${billing.billingPeriod === 'year' ? '\nBilling period: 1 year. No automatic renewal.' : ''}\nInvoice: ${invoice.reference}\nPayment reference: ${invoice.payment_id}\n\nYour paid invoice is attached.\n\nThank you,\n${billing.name || config.merchantName}${invoice.environment === 'test' ? '\n\nTEST PAYMENT: No live funds were collected.' : ''}`,
      attachments:[{filename:'invoice-' + invoice.reference.replace(/[^A-Za-z0-9_-]/g,'_') + '.pdf', content:attachment, contentType:'application/pdf'}]
    };
    try {
      const result = await transport.sendMail(message);
      if (!result.accepted?.some(email => email.toLowerCase() === invoice.customer_email.toLowerCase())) {
        const error = new Error('Recipient was not accepted.'); error.definitive = true; throw error;
      }
    } catch (cause) {
      const error = new Error('Email delivery failed.');
      // A disconnect during DATA may occur after acceptance. Do not automatically resend it.
      error.definitive = cause.definitive === true || (Number.isInteger(cause.responseCode) && cause.responseCode >= 400 && cause.responseCode < 600) || ['EAUTH','ECONNECTION','EDNS'].includes(cause.code) || cause.command === 'CONN';
      throw error;
    }
  };
}

