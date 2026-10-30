import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createSheetStore} from './sheets-store.mjs';
import {createRazorpay,validSignature} from './razorpay.mjs';
import {validateClientDetails,normalizeEmail} from '../dist/client-details.mjs';
import {availablePackage,packageName} from '../dist/packages.mjs';
import {renderInvoice} from './invoice-pdf.mjs';
import {createEmailSender} from './delivery-adapters.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const orderPattern=/^order_[A-Za-z0-9]+$/;
const paymentPattern=/^pay_[A-Za-z0-9]+$/;
function check(ok,status,message) {if(!ok){const error=new Error(message);error.status=status;throw error;}}
export function createSheetsApp({config,store=createSheetStore(config),provider=createRazorpay(config),sendEmail}) {
  const cookieName=config.secure ? '__Host-tootica_session' : 'tootica_session';
  const invitations=config.invitations || {required:false,adminKey:''};
  const reference=()=>`TOOTICA-${config.environment==='test'?'TEST':'REG'}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(5).toString('hex').toUpperCase()}`;
  const emailEnabled=config.email.enabled && (config.environment!=='test' || config.email.allowTest);
  const sender=sendEmail || (emailEnabled ? createEmailSender(config) : null);
  function orderResponse(r) {return {order_id:r.order_id,orderId:r.order_id,keyId:config.keyId,amount:r.amount,currency:r.currency,reference:r.reference,customerEmail:r.customer_email,packageId:r.package_id,packageName:packageName(r.package_id)};}
  function paidResponse(r) {return {status:'paid',orderId:r.order_id,paymentId:r.payment_id,amount:r.amount,currency:r.currency,reference:r.reference,customerEmail:r.customer_email,packageId:r.package_id,packageName:packageName(r.package_id),billingPeriod:JSON.parse(r.billing_snapshot || '{}').billingPeriod || null,emailDelivery:r.email_status==='done' ? 'sent' : !emailEnabled ? 'disabled' : r.email_status==='review' ? 'review' : 'pending'};}
  async function deliver(r) {
    if(!sender || !r || r.state!=='paid') return r;
    if(!JSON.parse(r.billing_snapshot || '{}').address) return r;
    const claim=randomUUID();
    const job=await store('email-claim',{id:r.id,claim});
    if(!job) return r;
    let failure;
    try {await sender(job);} catch(error){failure=error;}
    // If recording acceptance fails, leave sending; the next run flags it for review.
    return store('email-finish',{id:r.id,claim,success:!failure,definitive:failure?.definitive===true});
  }
  async function markPaid(r,payment) {
    check(paymentPattern.test(payment?.id || ''),409,'Invalid provider payment.');
    r=await store('paid',{id:r.id,payment,billing:JSON.stringify({...config.billing,fontPath:undefined,description:config.description,billingPeriod:availablePackage(r.package_id)?.billingPeriod || null})});
    // Payment confirmation must survive a temporary mail/storage outage.
    try {r=await deliver(r);} catch { /* Durable job will be checked on next request or scheduled run. */ }
    return paidResponse(r);
  }
  async function status(r) {
    if(r.state==='paid') {try {r=await deliver(r);}catch{}return paidResponse(r);}
    const payments=await provider.getPayments(r.order_id);
    check(Array.isArray(payments),502,'Invalid provider response.');
    const captured=payments.find(p=>p.status==='captured');
    if(captured) return markPaid(r,captured);
    const refunded=payments.some(p=>p.status==='refunded');
    const pending=payments.some(p=>!['created','failed','refunded'].includes(p.status));
    const incomplete=payments.some(p=>p.status==='created');
    r=await store('status',{id:r.id,state:refunded?'review':pending?'pending':incomplete || !payments.length?'created':'failed'});
    if(r.state==='paid') return paidResponse(r);
    return {status:refunded?'review':pending?'pending':'unpaid',orderId:r.order_id,retryAllowed:!pending && !refunded,reason:refunded?'refunded':payments.some(p=>p.status==='authorized')?'authorized':pending?'processing':incomplete?'checkout_incomplete':'not_paid'};
  }
  async function createOrder(r,request,body,sessionHash) {
    check(config.enabled,503,'Payments are disabled.');
    check(availablePackage(body.packageId ?? 'essential'),400,'This package is coming soon and cannot be selected yet.');
    check(Number.isSafeInteger(r.amount) && r.amount>=100,400,'Invoice amount must be at least 100 paise.');
    check((body.amount===undefined || body.amount===r.amount) && (body.currency===undefined || body.currency===r.currency) && (body.receipt===undefined || body.receipt===r.id),400,'Payment details must match your invoice.');
    const agreement=body.agreement;
    check(agreement?.accepted===true && typeof agreement.signerName==='string' && agreement.signerName.trim() && agreement.signerName.length<=120 && !/[\u0000-\u001f\u007f]/.test(agreement.signerName) && agreement.version===config.agreementVersion,400,'Accept the current agreement and enter your full name.');
    const key=request.headers.get('idempotency-key');
    check(typeof key==='string' && /^[A-Za-z0-9_-]{16,100}$/.test(key),400,'A valid idempotency key is required.');
    const email=normalizeEmail(body.email),details=validateClientDetails(body.clientDetails);
    check(email && details.valid,400,Object.values(details.errors)[0] || 'Enter a valid customer email address.');
    check(details.value.email===email && details.value.contactName===agreement.signerName.trim(),400,'Contact details must match the agreement and invoice email.');
    const claim=randomUUID();
    const prepared=await store('prepare',{sessionHash,key,claim,email,name:agreement.signerName.trim(),version:agreement.version,clientDetails:JSON.stringify(details.value),fingerprint:hash(JSON.stringify([agreement.signerName.trim(),agreement.version,email,details.value])),invitationRequired:invitations.required});
    r=prepared.invoice;
    if(prepared.action==='existing') return orderResponse(r);
    if(prepared.action==='reconcile') {
      const matches=await provider.findOrdersByReceipt(r.id);
      check(matches.length===1,409,'The previous checkout could not be confirmed yet. Please contact support@tootica.com with your invoice reference.');
      const recovered=matches[0];
      check(orderPattern.test(recovered?.id || '') && recovered.receipt===r.id && recovered.amount===r.amount && recovered.currency===r.currency,409,'The previous order does not match this invoice.');
      return orderResponse(await store('order-complete',{id:r.id,newOrderId:recovered.id}));
    }
    let order;
    try {order=await provider.createOrder(r);} catch(error) {
      if(error.orderNotCreated) await store('order-rejected',{id:r.id,claim});
      throw error;
    }
    check(orderPattern.test(order?.id || '') && order.receipt===r.id && order.amount===r.amount && order.currency===r.currency,502,'Invalid provider order.');
    return orderResponse(await store('order-complete',{id:r.id,newOrderId:order.id}));
  }
  async function handle(request, {ip} = {}) {
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
    const json=(code,body)=>new Response(JSON.stringify(body),{status:code,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
    try {
      const path=new URL(request.url).pathname;
      if(path==='/payment-config.json' && request.method==='GET') return json(200,{enabled:config.enabled && Boolean(config.sheetStore.url && config.sheetStore.secret),invitationRequired:invitations.required,environment:config.environment,provider:'razorpay',apiBase:'/api/payments',merchantName:config.merchantName,description:config.description,logo:'assets/tootica-logo.png',agreementVersion:config.agreementVersion,keyFingerprint:config.keyId?hash(config.keyId).slice(0,12):null});
      check(path.startsWith('/api/payments/'),404,'Endpoint not found.');
      // No paid or unpaid API access until a durable ledger has been configured.
      check(config.sheetStore.url && config.sheetStore.secret,503,'Google Sheets storage is not configured. Please contact support@tootica.com.');
      let raw='';
      if(request.method==='POST') {
        check(Number(request.headers.get('content-length') || 0)<=65536,413,'Request too large.');
        const reader=request.body?.getReader(); const chunks=[];let size=0;
        if(reader) for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();check(false,413,'Request too large.');}chunks.push(value);}
        raw=Buffer.concat(chunks).toString('utf8');
      }
      if(path==='/api/payments/webhook' && request.method==='POST') {
        check(validSignature(raw,request.headers.get('x-razorpay-signature'),config.webhookSecret),400,'Invalid webhook signature.');
        let event;try{event=JSON.parse(raw);}catch{check(false,400,'Invalid JSON.');}
        if(['payment.captured','payment.failed','order.paid'].includes(event.event)) {
          const orderId=event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
          check(orderPattern.test(orderId || ''),400,'Invalid webhook order.');
          let r;try{r=await store('get',{orderId});}catch(error){if(error.status===401)error.status=503;throw error;}
          const result=await status(r);
          if(event.event!=='payment.failed') check(result.status==='paid',503,'Capture is awaiting provider reconciliation.');
        }
        return json(200,{received:true});
      }
      check(!request.headers.get('origin') || request.headers.get('origin')===config.origin,403,'Origin is not allowed.');
      check(request.headers.get('sec-fetch-site')!=='cross-site',403,'Cross-site request blocked.');
      if(ip) await store('rate',{rateKey:hash(config.sheetStore.secret+'|'+ip)});
      if(path.startsWith('/api/payments/admin/')) {
        const credential=request.headers.get('authorization') || '';
        check(invitations.adminKey.length>=32 && credential.length<300 && timingSafeEqual(Buffer.from(hash(credential),'hex'),Buffer.from(hash('Bearer '+invitations.adminKey),'hex')),401,'Admin access denied.');
      }
      let body;
      if(request.method==='POST') {
        check(request.headers.get('origin')===config.origin && request.headers.get('content-type')?.split(';')[0]==='application/json',403,'Same-origin JSON request required.');
        try{body=JSON.parse(raw);}catch{check(false,400,'Invalid JSON.');}
        check(body && typeof body==='object' && !Array.isArray(body),400,'Invalid request.');
      }
      if(path==='/api/payments/admin/invitations' && request.method==='GET') return json(200,{environment:config.environment,invitations:await store('invitation-list')});
      if(path==='/api/payments/admin/invitations' && request.method==='POST') {
        const email=normalizeEmail(body.email),name=typeof body.name==='string'?body.name.trim():'';
        check(email && name && name.length<=120 && !/[\u0000-\u001f\u007f]/.test(name),400,'Enter the client name and a valid email address.');
        check(Number.isInteger(body.days) && body.days>=1 && body.days<=7,400,'Invitation expiry must be between 1 and 7 days.');
        check(Number.isSafeInteger(config.registrationAmount),503,'Configure the registration price first.');
        const invitationToken=randomBytes(32).toString('base64url');
        const invitation=await store('invitation-create',{id:randomUUID(),reference:reference(),amount:config.registrationAmount,name,email,days:body.days,invitationHash:hash(invitationToken)});
        return json(201,{invitation,url:config.origin+'/#invite='+invitationToken});
      }
      if(path==='/api/payments/admin/invitations/revoke' && request.method==='POST') {
        check(typeof body.id==='string' && /^[a-f0-9-]{36}$/.test(body.id),400,'Invalid invitation.');
        return json(200,{invitation:await store('invitation-revoke',{id:body.id})});
      }
      check(!path.startsWith('/api/payments/admin/'),404,'Endpoint not found.');
      const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      const sessionHash=typeof token==='string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? hash(token) : null;
      if(path==='/api/payments/session' && request.method==='POST') {
        check(body.token===undefined,400,'Manual invoice links are unavailable. Open the registration page directly.');
        check(config.enabled && Number.isSafeInteger(config.registrationAmount),503,'Online payments are not available yet.');
        const nextToken=randomBytes(32).toString('base64url'),newSessionHash=hash(nextToken);
        check(body.invitationToken===undefined || (typeof body.invitationToken==='string' && /^[A-Za-z0-9_-]{43}$/.test(body.invitationToken)),403,'Invalid invitation link.');
        const r=await store('session',{sessionHash,newSessionHash,id:randomUUID(),reference:reference(),amount:config.registrationAmount,invitationRequired:invitations.required,invitationHash:body.invitationToken?hash(body.invitationToken):undefined});
        if(r.sessions.some(s=>s.hash===newSessionHash)) headers['Set-Cookie']=`${cookieName}=${nextToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.secure?'; Secure':''}`;
        return json(200,{ready:true});
      }
      check(sessionHash,401,'Your registration session has expired. Reload this page to continue.');
      const r=await store('get',{sessionHash});
      if(invitations.required && !r.invitation_hash && !r.order_id) check(false,403,'An invitation is required. Please use the link sent by Tootica.');
      check(!r.invitation_revoked,403,'This invitation was revoked. Please contact support@tootica.com.');
      if(path==='/api/payments/summary' && request.method==='GET') return json(200,{amount:r.amount,currency:r.currency,reference:r.reference,invitedEmail:r.invitation_email || null,invitedName:r.invitation_name || null,packageId:r.package_id,packageName:packageName(r.package_id),clientDetails:r.client_details?JSON.parse(r.client_details):null,detailsLocked:Boolean(r.client_details),...(r.state==='paid'?{payment:paidResponse(r),order:orderResponse(r)}:{})});
      if(path==='/api/payments/orders' && request.method==='POST') return json(200,await createOrder(r,request,body,sessionHash));
      if(path==='/api/payments/verify' && request.method==='POST') {
        check(orderPattern.test(body.razorpay_order_id || '') && paymentPattern.test(body.razorpay_payment_id || '') && /^[a-f0-9]{64}$/i.test(body.razorpay_signature || ''),400,'Valid payment ID, order ID and signature are required.');
        check(body.razorpay_order_id===r.order_id && (body.orderId===undefined || body.orderId===r.order_id),403,'Order does not belong to this invoice.');
        check(validSignature(r.order_id+'|'+body.razorpay_payment_id,body.razorpay_signature,config.keySecret),400,'Invalid payment signature.');
        const payment=await provider.getPayment(body.razorpay_payment_id);
        return json(200,payment.status==='captured'?await markPaid(r,payment):await status(r));
      }
      if(path==='/api/payments/orders/'+r.order_id && request.method==='GET') return json(200,await status(r));
      if(path==='/api/payments/invoice' && request.method==='GET') {
        check(r.state==='paid',409,'A paid invoice is available after payment confirmation.');
        const pdf=await renderInvoice(r,{fontPath:config.billing.fontPath});
        return new Response(new Uint8Array(pdf),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="invoice-'+r.reference.replace(/[^A-Za-z0-9_-]/g,'_')+'.pdf"'}});
      }
      return json(404,{error:'Endpoint not found.'});
    } catch(error) {return json(error.status || 502,{error:error.status?error.message:'Payment service unavailable. Please contact support@tootica.com.'});}
  }
  return {handle,async runDeliveries(limit=5) {
    if(!emailEnabled) return 0;
    let delivered=0;
    for(let i=0;i<limit;i++) {const r=await store('email-next');if(!r)break;const result=await deliver(r);if(result?.email_status==='done')delivered++;else if(!JSON.parse(r.billing_snapshot || '{}').address)break;}
    return delivered;
  }};
}
