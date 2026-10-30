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
  const response=await fetch('/api/payments/admin/invitations'+path,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer '+credential,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok){if(response.status===401)lock();throw new Error(data.error || 'Could not complete this request.');}
  return data;
}
async function run(work){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await work();}catch(error){notice(error.message || 'Could not connect. Please try again.',true);}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>{b.disabled=b.dataset.unavailable==='true';});}
}
async function refresh(){
  const data=await api();
  document.getElementById('admin-environment').textContent='Payment environment: '+data.environment.toUpperCase();
  const rows=data.invitations.map(invitation=>{
    const row=document.createElement('tr');
    for(const text of [invitation.name,invitation.email,invitation.status,new Date(invitation.expiresAt).toLocaleString()]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    const action=document.createElement('td'),button=document.createElement('button');
    button.type='button';button.className='secondary-button';button.textContent='Revoke';button.dataset.unavailable=String(['completed','revoked','checkout started'].includes(invitation.status));button.disabled=button.dataset.unavailable==='true';
    button.addEventListener('click',()=>{if(confirm('Revoke the invitation for '+invitation.email+'?'))void run(async()=>{await api('/revoke',{id:invitation.id});result.hidden=true;link.value='';await refresh();notice('Invitation revoked.');});});
    action.append(button);row.append(action);return row;
  });
  if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='No invitations yet.';row.append(cell);rows.push(row);}
  document.getElementById('invitation-list').replaceChildren(...rows);
}
login.addEventListener('submit',event=>{event.preventDefault();void run(async()=>{credential=document.getElementById('admin-key').value;await refresh();document.getElementById('admin-key').value='';login.hidden=true;content.hidden=false;logout.hidden=false;notice('Admin unlocked. The access key is kept only in this page’s memory.');});});
logout.addEventListener('click',()=>{lock();notice('Admin locked.');});
document.getElementById('invitation-refresh').addEventListener('click',()=>void run(async()=>{await refresh();notice('Invitation list updated.');}));
createForm.addEventListener('submit',event=>{event.preventDefault();void run(async()=>{const fields=new FormData(createForm);const data=await api('',{name:fields.get('name'),email:fields.get('email'),days:Number(fields.get('days'))});link.value=data.url;result.hidden=false;await refresh();notice('Invitation created. Copy the link and send it directly to the client.');});});
document.getElementById('invitation-copy').addEventListener('click',()=>void run(async()=>{try{await navigator.clipboard.writeText(link.value);notice('Invitation link copied.');}catch{link.focus();link.select();notice('Select and copy the invitation link above.');}}));
window.addEventListener('pagehide',lock);
