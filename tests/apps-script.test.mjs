import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import vm from 'node:vm';

test('Apps Script authenticates, locks writes, separates environments and escapes formulas',()=>{
  const secret='test-secret-'.repeat(4),tables=new Map(),cache=new Map();let locked=false,writes=0;
  const book={getSheetByName:name=>tables.get(name),insertSheet:name=>{
    const rows=[];const sheet={getLastRow:()=>rows.length,setFrozenRows(){},hideColumns(){},getRange(row,col,count=1,width=1){return {getValue:()=>rows[row-1]?.[col-1],getValues:()=>rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),setValues(values){assert.equal(locked,true);writes++;values.forEach((value,i)=>{rows[row-1+i] ||= [];value.forEach((v,j)=>rows[row-1+i][col-1+j]=v);});}};}};tables.set(name,sheet);sheet.rows=rows;return sheet;
  }};
  const context=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='SHEETS_STORE_SECRET'?secret:'sheet-id'})},Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(packet,key)=>Array.from(createHmac('sha256',key).update(packet).digest())},LockService:{getScriptLock:()=>({tryLock(){assert.equal(locked,false);locked=true;return true;},hasLock:()=>locked,releaseLock(){locked=false;}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},SpreadsheetApp:{openById:()=>book,flush(){}},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}});
  vm.runInContext(readFileSync(new URL('../google-apps-script/State.gs',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8'),context);
  function call(action,payload={},override={}) {
    const packet=JSON.stringify({action,payload:{environment:'test',...payload},timestamp:Date.now(),nonce:randomUUID()});
    return context.doPost({postData:{contents:JSON.stringify({packet,signature:createHmac('sha256',secret).update(packet).digest('hex'),...override})}});
  }
  assert.equal(call('ping',{}, {signature:'0'.repeat(64)}).ok,false);assert.equal(writes,0);
  assert.equal(call('ping').value.ready,true);assert.equal(locked,false);
  const session={id:'invoice',newSessionHash:'session-hash',reference:'REF-1',amount:1187000};
  assert.equal(call('session',session).ok,true);
  const details=JSON.stringify({clinicName:'=HYPERLINK("malicious")',phone:'+919876543210'});
  assert.equal(call('prepare',{sessionHash:'session-hash',key:'attempt-1',fingerprint:'fingerprint',clientDetails:details,email:'client@example.com',name:'Client',version:'v1',claim:'claim'}).ok,true);
  const rows=tables.get('RegistrationsTest').rows;
  assert.equal(rows.length,2);assert.equal(rows[1][2],'\'=HYPERLINK("malicious")');assert.equal(rows[1][5],"'+919876543210");
  assert.equal(JSON.parse(rows[1][0]).state,'creating');
  assert.equal(call('get',{id:'invoice',environment:'live'}).ok,false);assert.ok(tables.has('RegistrationsLive'));assert.equal(locked,false);
  const invitation=call('invitation-create',{id:'invited',reference:'INVITED',amount:1187000,name:'Invited client',email:'invited@example.com',days:7,invitationHash:'hashed-invite'});
  assert.equal(invitation.ok,true);
  assert.equal(call('invitation-list').value[0].status,'pending');
  assert.equal(call('session',{invitationHash:'hashed-invite',newSessionHash:'invited-session',invitationRequired:true}).ok,true);
  assert.equal(call('invitation-list').value[0].status,'opened');
  assert.equal(call('invitation-revoke',{id:'invited'}).value.status,'revoked');
  assert.equal(JSON.parse(tables.get('RegistrationsTest').rows[2][0]).invitation_revoked,true);
  assert.equal(locked,false);
});
test('generated Apps Script state engine matches tested source',()=>{
  const source=readFileSync(new URL('../server/sheet-state.mjs',import.meta.url),'utf8').replace('export function','function');
  assert.ok(readFileSync(new URL('../google-apps-script/State.gs',import.meta.url),'utf8').endsWith(source));
});
