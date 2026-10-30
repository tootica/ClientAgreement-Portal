let credential='';
let busy=false;
const login=document.getElementById('admin-login');
const content=document.getElementById('admin-content');
const status=document.getElementById('admin-status');
const logout=document.getElementById('admin-logout');
const createForm=document.getElementById('invitation-create');
const result=document.getElementById('invitation-result');
const link=document.getElementById('invitation-link');
function notice(message,error=false){status.textContent=message;status.classList.toggle('is-error',error);}
function lock(){credential='';content.hidden=true;logout.hidden=true;login.hidden=false;result.hidden=true;link.value='';document.getElementById('invitation-list').replaceChildren();createForm.reset();document.getElementById('admin-key').value='';}
async function api(path='',body){
  const response=await fetch('/api/payments/admin/invitations'+path,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',redirect:'error',headers:{Authorization:'Bearer '+credential,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
  if(!response.headers.get('content-type')?.includes('application/json')){
    if(response.status===401 || response.status===403)throw new Error('Site access was blocked by the hosting provider. Sign in to Netlify site access, or ask the site owner to check Visitor access settings.');
    throw new Error('The invitation service returned an unexpected response (HTTP '+response.status+'). Please check Netlify function logs or contact the site owner.');
  }
  let data;
  try{data=await response.json();}catch{throw new Error('The invitation service returned an invalid response. Please try again or check Netlify function logs.');}
  if(!response.ok){if(response.status===401)lock();throw new Error(typeof data?.error==='string'?data.error:'Could not complete this request.');}
  if(!data || typeof data!=='object')throw new Error('The invitation service returned an invalid response.');
  return data;
}
async function run(work){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await work();}catch(error){notice(error.message || 'Could not connect. Please try again.',true);}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>{b.disabled=b.dataset.unavailable==='true';});}
}
async function refresh(){
  const data=await api();
  const emailSettings=document.getElementById('invitation-email-settings');
  const emailReady=data.invitationEmail?.enabled===true;
  emailSettings.textContent=emailReady?'Automatic invitation email is enabled. Each new invitation will be emailed to the entered address.':
    data.invitationEmail?.reason==='test-disabled'?'Test email is disabled. Set EMAIL_ALLOW_TEST=true in Netlify and redeploy to send test invitations.':
    data.invitationEmail?.reason==='disabled'?'Automatic email is disabled. Set EMAIL_ENABLED=true and complete the SMTP and company billing settings in Netlify, then redeploy. You can still create links to share manually.':
    'Email settings could not be confirmed. Redeploy the latest invitation backend before sending invitations.';
  emailSettings.classList.toggle('is-error',!emailReady);
  createForm.querySelector('button[type=submit]').textContent=emailReady?'Create and email invitation':'Create invitation link';
  const rows=data.invitations.map(invitation=>{
    const row=document.createElement('tr');
    const deliveryLabels={sent:'Accepted for delivery',failed:'Not sent',review:'Check Brevo logs',sending:'Sending',disabled:'Email disabled'};
    for(const text of [invitation.name,invitation.email,invitation.status,deliveryLabels[invitation.emailDelivery] || 'Not recorded',new Date(invitation.expiresAt).toLocaleString()]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary-button';button.textContent='Revoke';button.dataset.unavailable=String(['completed','revoked','checkout started'].includes(invitation.status));button.disabled=button.dataset.unavailable==='true';
    button.addEventListener('click',()=>{if(confirm('Revoke the invitation for '+invitation.email+'?'))void run(async()=>{await api('/revoke',{id:invitation.id});result.hidden=true;link.value='';await refresh();notice('Invitation revoked.');});});
    action.append(button);row.append(action);return row;
  });
  if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=6;cell.textContent='No invitations yet.';row.append(cell);rows.push(row);}
  document.getElementById('invitation-list').replaceChildren(...rows);
}
login.addEventListener('submit',event=>{event.preventDefault();void run(async()=>{credential=document.getElementById('admin-key').value;await refresh();document.getElementById('admin-key').value='';login.hidden=true;content.hidden=false;logout.hidden=false;notice('Admin unlocked. The access key is kept only in this page’s memory.');});});
logout.addEventListener('click',()=>{lock();notice('Admin locked.');});
document.getElementById('invitation-refresh').addEventListener('click',()=>void run(async()=>{await refresh();notice('Invitation list updated.');}));
createForm.addEventListener('submit',event=>{event.preventDefault();void run(async()=>{
  notice('Creating the invitation and checking email delivery…');
  const fields=new FormData(createForm);
  const data=await api('',{name:fields.get('name'),email:fields.get('email'),days:Number(fields.get('days'))});
  link.value=data.url;result.hidden=false;
  const deliveryMessages={
    sent:'Invitation email accepted for delivery to '+data.invitation.email+'. You can also copy the same link below.',
    failed:'Invitation created, but the email was not sent. Copy the link below and share it directly with the client.',
    review:'Invitation created, but email delivery could not be confirmed. Check Brevo logs before sending it again. The same link is available below.',
    disabled:'Invitation created. Email delivery is disabled for this environment. Copy the link below to share it manually.',
    unavailable:'Invitation created, but automatic email needs the latest Apps Script State.gs deployment. Copy the link below to share it manually.'
  };
  const message=deliveryMessages[data.emailDelivery] || 'Invitation created, but this backend did not report email delivery. Redeploy the latest Netlify code and Apps Script State.gs; copy the link below if needed.';
  document.getElementById('invitation-delivery').textContent=message;
  await refresh();notice(message,['failed','review','unavailable'].includes(data.emailDelivery));
});});
document.getElementById('invitation-copy').addEventListener('click',()=>void run(async()=>{try{await navigator.clipboard.writeText(link.value);notice('Invitation link copied.');}catch{link.focus();link.select();notice('Select and copy the invitation link above.');}}));
window.addEventListener('pagehide',lock);
