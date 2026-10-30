// Runs under a Google Apps Script ScriptLock. No filesystem or database access.
export function applySheetAction(records, action, p, now = Date.now()) {
  if(action==='ping') return {ready:true};
  function check(ok, status, message) {if (!ok) {const e=new Error(message); e.status=status; throw e;}}
  const invitationOpen = row => row.invitation_hash && !row.invitation_revoked && row.invitation_expires>now;
  const invitationView = row => ({id:row.id,reference:row.reference,name:row.invitation_name,email:row.invitation_email,createdAt:row.created_at,expiresAt:row.invitation_expires,
    emailDelivery:row.invitation_mail_status==='sending' && row.invitation_mail_started<now-120000?'review':row.invitation_mail_status || 'disabled',
    status:row.state==='paid'?'completed':row.invitation_revoked?'revoked':row.order_id || row.state==='creating'?'checkout started':row.invitation_expires<=now?'expired':row.sessions.length?'opened':'pending'});
  function newRecord() {
    check(records.length<2000,503,'Registration capacity needs review. Please contact support@tootica.com.');
    return {id:p.id,reference:p.reference,amount:p.amount,currency:'INR',environment:p.environment,created_at:now,expires_at:now+7*86400000,
      sessions:[],state:'new',package_id:'essential',attempts:{},email_status:'pending',email_attempts:0};
  }
  if (action==='invitation-list') return records.filter(r=>r.environment===p.environment && r.invitation_hash).map(invitationView).reverse();
  if (action==='invitation-create') {
    const row=newRecord();
    row.invitation_hash=p.invitationHash;row.invitation_email=p.email;row.invitation_name=p.name;
    row.invitation_expires=now+p.days*86400000;row.expires_at=row.invitation_expires;
    row.invitation_mail_status=p.sendEmail===true?'sending':'disabled';
    if(p.sendEmail===true)row.invitation_mail_started=now;
    records.push(row);return invitationView(row);
  }
  if (action==='invitation-mail-finish') {
    const row=records.find(r=>r.environment===p.environment && r.id===p.id && r.invitation_hash);
    check(row,404,'Invitation not found.');
    check(['sent','failed','review'].includes(p.status),400,'Invalid invitation email status.');
    check(row.invitation_mail_status==='sending' || row.invitation_mail_status===p.status,409,'Invitation email status has already been recorded.');
    row.invitation_mail_status=p.status;return invitationView(row);
  }
  if (action==='invitation-revoke') {
    const row=records.find(r=>r.environment===p.environment && r.id===p.id && r.invitation_hash);
    check(row,404,'Invitation not found.');
    check(row.state==='new' && !row.order_id,409,'Checkout has already started. Reconcile the payment before making changes.');
    row.invitation_revoked=true;return invitationView(row);
  }
  const find = () => {
    const row=records.find(r=>r.environment===p.environment && (p.sessionHash ? r.sessions.some(s=>s.hash===p.sessionHash && s.expires>now) && r.expires_at>now : p.orderId ? r.order_id===p.orderId : r.id===p.id));
    check(row,401,'Your registration session has expired. Reload this page to continue.'); return row;
  };
  if (action==='session') {
    let row=p.sessionHash && records.find(r=>r.environment===p.environment && r.expires_at>now && r.sessions.some(s=>s.hash===p.sessionHash && s.expires>now));
    if (p.invitationHash) {
      const invite=records.find(r=>r.environment===p.environment && r.invitation_hash===p.invitationHash);
      if(invite && row && row.id===invite.id && row.state==='paid') return row;
      check(invite && invitationOpen(invite),403,'This invitation is invalid, expired or revoked. Please contact support@tootica.com for a new link.');
      check(invite.state!=='paid',409,'This invitation has already been completed. Use the original browser to download your invoice.');
      if(row && row.id===invite.id) return row;
      check(invite.sessions.length===0,409,'This invitation has already been opened in another browser. Continue there or contact support@tootica.com for a new link.');
      invite.sessions=[{hash:p.newSessionHash,expires:Math.min(now+12*3600000,invite.invitation_expires)}];
      return invite;
    }
    if (row) {
      check(!p.invitationRequired || row.invitation_hash || row.state==='paid',403,'An invitation is required. Please use the link sent by Tootica.');
      check(!row.invitation_hash || invitationOpen(row) || row.order_id || row.state==='paid',403,'This invitation has expired or was revoked. Please contact support@tootica.com.');
      if (!row.invitation_hash && row.state==='new' && !row.client_details) row.amount=p.amount;
      return row;
    }
    check(!p.invitationRequired,403,'An invitation is required. Please use the link sent by Tootica.');
    row=newRecord();row.sessions=[{hash:p.newSessionHash,expires:now+12*3600000}];
    records.push(row); return row;
  }
  if (action==='email-next') {
    for (const r of records.filter(r=>r.environment===p.environment && r.email_status==='sending' && r.email_started<now-120000)) r.email_status='review';
    return records.find(r=>r.environment===p.environment && r.state==='paid' && r.email_status==='pending' && (r.email_next || 0)<=now) || null;
  }
  const r=find();
  if (action==='get') return r;
  if (action==='prepare') {
    check(!p.invitationRequired || r.invitation_hash,403,'An invitation is required.');
    if(r.invitation_hash) {
      check(!r.invitation_revoked,403,'This invitation was revoked. Please contact support@tootica.com.');
      check(r.order_id || r.state==='creating' || invitationOpen(r),403,'This invitation has expired. Please contact support@tootica.com.');
      check(r.invitation_email===p.email,400,'Use the email address this invitation was issued to.');
    }
    check(!r.client_details || r.client_details===p.clientDetails,409,'Billing details are already recorded. Please contact support@tootica.com to correct them.');
    check(!r.customer_email || (r.customer_email===p.email && r.customer_name===p.name),409,'Invoice contact details are already recorded.');
    check(!r.attempts[p.key] || r.attempts[p.key]===p.fingerprint,409,'Idempotency key was already used for different details.');
    check(r.attempts[p.key] || Object.keys(r.attempts).length<20,429,'Too many checkout attempts. Please contact support@tootica.com.');
    r.attempts[p.key]=p.fingerprint; r.client_details=p.clientDetails; r.customer_name=p.name; r.customer_email=p.email;
    if (!r.acceptance) r.acceptance = {name:p.name,email:p.email,version:p.version,accepted_at:now};
    if (r.order_id) return {invoice:r,action:'existing'};
    if (r.state==='creating') return {invoice:r,action:'reconcile'};
    check(r.state==='new',409,'Order creation needs reconciliation. Please contact support@tootica.com.');
    r.state='creating'; r.claim=p.claim; return {invoice:r,action:'create'};
  }
  if (action==='order-complete') {
    check(!r.order_id || r.order_id===p.newOrderId,409,'Invoice order changed. Please check payment status.');
    check(!records.some(other=>other.id!==r.id && other.order_id===p.newOrderId),409,'Order already belongs to another registration.');
    check(r.state==='creating' || r.order_id===p.newOrderId,409,'Order state changed. Please contact support@tootica.com.');
    r.order_id=p.newOrderId; if(r.state!=='paid') r.state='created'; return r;
  }
  if (action==='order-rejected') {
    if (r.state==='creating' && !r.order_id && r.claim===p.claim) r.state='new'; return r;
  }
  if (action==='status') {if(r.state!=='paid') r.state=p.state; return r;}
  if (action==='paid') {
    check(r.order_id===p.payment.order_id && r.amount===p.payment.amount && r.currency===p.payment.currency && p.payment.status==='captured' && p.payment.captured===true && !p.payment.refund_status && !p.payment.amount_refunded,409,'Payment does not match the invoice or needs review.');
    check(!r.payment_id || r.payment_id===p.payment.id,409,'Invoice has a different payment.');
    check(!records.some(other=>other.id!==r.id && other.payment_id===p.payment.id),409,'Payment already belongs to another registration.');
    r.payment_id=p.payment.id; r.state='paid';
    if (!r.paid_at) r.paid_at = now;
    if (!r.billing_snapshot) r.billing_snapshot = p.billing;
    return r;
  }
  if (action==='email-claim') {
    if (r.email_status==='sending' && r.email_started<now-120000) r.email_status='review';
    if (r.state!=='paid' || r.email_status!=='pending' || (r.email_next || 0)>now) return null;
    r.email_status='sending'; r.email_claim=p.claim; r.email_started=now; r.email_attempts++; return r;
  }
  if (action==='email-finish') {
    check(r.email_status==='sending' && r.email_claim===p.claim,409,'Email claim changed; manual review required.');
    r.email_status=p.success ? 'done' : p.definitive && r.email_attempts<10 ? 'pending' : 'review';
    if(r.email_status==='pending') r.email_next=now+Math.min(3600000,60000*2**Math.min(r.email_attempts-1,6));
    return r;
  }
  if (action==='email-retry') {
    check(p.confirmed===true && r.email_status==='review',400,'Only a reviewed email confirmed as not delivered can be retried.');
    r.email_status='pending';r.email_next=0;r.email_attempts=0;return r;
  }
  check(false,400,'Unknown storage action.');
}
