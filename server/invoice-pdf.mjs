import PDFDocument from 'pdfkit';
import {packageName} from '../dist/packages.mjs';

export function renderInvoice(invoice, {fontPath = ''} = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size:'A4', margin:52, info:{Title:'Paid invoice ' + invoice.reference}});
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const billing = JSON.parse(invoice.billing_snapshot || '{}');
      if (fontPath) doc.font(fontPath);
      doc.fontSize(22).fillColor('#0F71D6').text(billing.name || 'Tootica');
      doc.fontSize(10).fillColor('#222222').text(billing.address || '', {width:480});
      if (billing.taxId) doc.text('Tax registration: ' + billing.taxId);
      doc.moveDown().fontSize(18).text('Paid Invoice');
      if (invoice.environment === 'test') doc.fontSize(11).fillColor('#9b2020').text('TEST PAYMENT — No live funds collected').fillColor('#222222');
      doc.fontSize(11).text('Invoice: ' + invoice.reference);
      doc.text('Paid on: ' + new Date(invoice.paid_at).toISOString().slice(0,10) + ' (UTC)');
      doc.text('Payment reference: ' + invoice.payment_id);
      doc.text('Order reference: ' + invoice.order_id);
      doc.moveDown().text('Billed to: ' + (invoice.customer_name || 'Customer'));
      doc.text(invoice.customer_email || '');
      if (invoice.client_details) {
        const client = JSON.parse(invoice.client_details);
        doc.text(client.clinicName);
        doc.text(client.phone);
        doc.text([client.addressLine1,client.addressLine2].filter(Boolean).join(', '));
        doc.text(`${client.city}, ${client.state} ${client.postalCode}, ${client.country}`);
        if (client.gstin) doc.text('Customer GSTIN: ' + client.gstin);
      }
      doc.moveDown().text(billing.description || 'Tootica registration');
      if (invoice.package_id) doc.text('Package: ' + packageName(invoice.package_id));
      if (billing.billingPeriod === 'year') doc.text('Billing period: 1 year. No automatic renewal.');
      doc.moveDown().fontSize(15).text('Total paid: INR ' + (invoice.amount / 100).toFixed(2));
      doc.fontSize(11).text('Balance due: INR 0.00');
      doc.moveDown().fontSize(10).text('Payment confirmed. Thank you for registering with ' + (billing.name || 'Tootica') + '.');
      doc.end();
    } catch (error) {doc.destroy(); reject(error);}
  });
}
