import PDFDocument from 'pdfkit';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {packageName} from '../dist/packages.mjs';

async function readAsset(staticDir, path) {
  // Bundled functions relocate modules; Netlify includes assets at the task root.
  return readFile(join(staticDir, path), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(resolve('dist', path), 'utf8');
  });
}

// Read the same terms shown to the client so the email copy stays in sync.
export async function renderAgreement(invoice, {staticDir, fontPath = ''} = {}) {
  const html = await readAsset(staticDir, 'index.html');
  const article = html.match(/<article class="terms-content">([\s\S]*?)<form /)?.[1];
  const sections = [...(article || '').matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)];
  if (!sections.length) throw new Error('Client agreement terms are unavailable.');
  const plainText = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  const acceptance = invoice.acceptance;
  if (!acceptance?.name || !acceptance.version || !Number.isFinite(acceptance.accepted_at)) throw new Error('Client agreement acceptance is unavailable.');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({size:'A4', margins:{top:56,right:56,bottom:60,left:56}, bufferPages:true, info:{Title:'Client Agreement ' + invoice.reference}});
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    // Standard PDF fonts do not contain the rupee glyph.
    const text = value => fontPath ? value : value.replaceAll('₹', 'INR ');
    try {
      const regular = () => doc.font(fontPath || 'Helvetica');
      const bold = () => doc.font(fontPath || 'Helvetica-Bold');
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const ensureSpace = height => {if (doc.y + height > bottom()) doc.addPage();};
      bold().fontSize(22).fillColor('#0F71D6').text('Tootica Client Agreement');
      doc.y += 14;
      regular().fillColor('#555555').fontSize(9.5);
      const details = ['Invoice: ' + invoice.reference, 'Agreement version: ' + acceptance.version];
      if (invoice.package_id) details.push('Package: ' + packageName(invoice.package_id));
      if (invoice.client_details) {
        const client = JSON.parse(invoice.client_details);
        details.push('Clinic: ' + client.clinicName);
      }
      details.forEach(line => {doc.text(line, {lineGap:2});doc.y += 4;});
      if (invoice.environment === 'test') {
        doc.y += 2;
        doc.fillColor('#9b2020').text('TEST PAYMENT — No live funds collected');
      }
      doc.y += 16;
      doc.save().strokeColor('#DEE3E9').lineWidth(0.7)
        .moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width-doc.page.margins.right, doc.y).stroke().restore();
      doc.y += 6;
      for (const section of sections) {
        const blocks = [...section[1].matchAll(/<(h2|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)];
        for (const [index, block] of blocks.entries()) {
          const heading = block[1] === 'h2';
          const listItem = block[1] === 'li';
          const value = text(plainText(block[2]));
          if (heading) {
            // Keep each heading with its opening paragraph across page breaks.
            const next = blocks[index + 1];
            regular().fontSize(10.5);
            const openingHeight = next ? doc.heightOfString(text(plainText(next[2])), {width:contentWidth - (next[1] === 'li' ? 14 : 0),lineGap:3}) : 0;
            bold().fontSize(12.5);
            ensureSpace(36 + doc.heightOfString(value, {width:contentWidth,lineGap:2}) + openingHeight);
            doc.y += 19;
            bold().fontSize(12.5).fillColor('#222222').text(value, {lineGap:2});
            doc.y += 9;
          } else {
            regular().fontSize(10.5).fillColor('#333333');
            const x = doc.page.margins.left + (listItem ? 14 : 0);
            const options = {width:contentWidth - (listItem ? 14 : 0),lineGap:3};
            const height = doc.heightOfString(value, options);
            if (height < bottom()-doc.page.margins.top) ensureSpace(height + 8);
            if (listItem) doc.text('•', doc.page.margins.left, doc.y, {lineBreak:false});
            doc.text(value, x, doc.y, options);
            doc.y += 8;
            doc.x = doc.page.margins.left;
          }
        }
      }
      // Keep the acceptance details and signature together on the final page.
      const blockWidth = 225;
      const rightEdge = doc.page.width - doc.page.margins.right;
      const blockX = rightEdge - blockWidth;
      const acceptedAt = new Date(acceptance.accepted_at).toLocaleString('en-IN', {
        timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true
      }) + ' IST';
      const metadata = ['Name: ' + acceptance.name, 'Email: ' + acceptance.email, 'Date: ' + acceptedAt];
      regular().fontSize(12);
      const signatureHeight = doc.heightOfString(acceptance.name, {width:blockWidth,lineGap:2});
      regular().fontSize(9);
      const blockHeight = metadata.reduce((height, line) => height + doc.heightOfString(line, {width:blockWidth,lineGap:2}) + 7, 0) + 196 + signatureHeight;
      ensureSpace(blockHeight);
      doc.y += 22;
      doc.save().strokeColor('#DEE3E9').lineWidth(0.7)
        .moveTo(doc.page.margins.left, doc.y).lineTo(rightEdge, doc.y).stroke().restore();
      doc.y += 18;
      bold().fontSize(12.5).fillColor('#222222').text('Acceptance');
      doc.y += 10;
      regular().fontSize(10.5).text('I have read and agree to the Client Agreement.', {lineGap:3});
      const signatureY = doc.y + 28;
      regular().fontSize(12).fillColor('#222222').text(acceptance.name, blockX, signatureY, {
        width:blockWidth,align:'right',lineGap:2
      });
      const lineY = signatureY + signatureHeight + 12;
      doc.save().strokeColor('#777777').lineWidth(0.5)
        .moveTo(blockX, lineY).lineTo(rightEdge, lineY).stroke().restore();
      bold().fontSize(9).text('Client / Authorised Signatory', blockX, lineY + 10, {width:blockWidth,align:'right'});
      doc.y += 10;
      regular().fillColor('#555555');
      metadata.forEach(line => {
        doc.text(line, blockX, doc.y, {width:blockWidth,align:'right',lineGap:2});
        doc.y += 7;
      });
      const pages = doc.bufferedPageRange();
      for (let page = pages.start; page < pages.start + pages.count; page++) {
        doc.switchToPage(page);
        const footerY = doc.page.height - 34;
        const bottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        regular().fontSize(8).fillColor('#777777');
        doc.text('Tootica | Client Agreement', doc.page.margins.left, footerY, {lineBreak:false});
        doc.text(`${page + 1} / ${pages.count}`, rightEdge - 60, footerY, {width:60,align:'right',lineBreak:false});
        doc.page.margins.bottom = bottomMargin;
      }
      doc.end();
    } catch (error) {doc.destroy(); reject(error);}
  });
}
