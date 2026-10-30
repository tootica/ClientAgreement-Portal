// Deploy as a Web App: execute as owner; access Anyone. HMAC authenticates every request.
// Script Properties: SPREADSHEET_ID and SHEETS_STORE_SECRET (same secret as server).
function doPost(e) {
  var lock;
  try {
    var props=PropertiesService.getScriptProperties();
    var secret=props.getProperty('SHEETS_STORE_SECRET');
    if (!secret || !props.getProperty('SPREADSHEET_ID')) throw new Error('Missing storage configuration');
    var envelope=JSON.parse(e.postData.contents);
    if(typeof envelope.packet!=='string' || envelope.packet.length>65536 || !/^[a-f0-9]{64}$/.test(envelope.signature || '')) throw new Error('Invalid authentication');
    var expected=Utilities.computeHmacSha256Signature(envelope.packet,secret,Utilities.Charset.UTF_8).map(function(b){return ((b+256)%256).toString(16).padStart(2,'0');}).join('');
    var difference=0;for(var i=0;i<64;i++) difference |= expected.charCodeAt(i)^envelope.signature.charCodeAt(i);
    if(difference) throw new Error('Invalid authentication');
    var request=JSON.parse(envelope.packet);
    if(!Number.isFinite(request.timestamp) || Math.abs(Date.now()-request.timestamp)>60000 || !/^[a-f0-9-]{36}$/.test(request.nonce || '')) throw new Error('Expired authentication');
    var environment=request.payload.environment;
    if(environment!=='test' && environment!=='live') throw new Error('Invalid environment');
    lock=LockService.getScriptLock();
    if(!lock.tryLock(5000)) return reply_({ok:false,status:503});
    var cache=CacheService.getScriptCache();
    if(cache.get(request.nonce)) throw new Error('Repeated request');
    cache.put(request.nonce,'1',120);
    if(request.action==='rate') {
      if(!/^[a-f0-9]{64}$/.test(request.payload.rateKey || '')) throw new Error('Invalid rate key');
      var rateKey='rate-'+environment+'-'+request.payload.rateKey+'-'+Math.floor(Date.now()/60000);
      var visits=Number(cache.get(rateKey) || 0)+1;
      if(visits>120) return reply_({ok:false,status:429,error:'Too many requests. Please try again later.'});
      cache.put(rateKey,String(visits),120);
      return reply_({ok:true,value:true});
    }
    var book=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    var name=environment==='live' ? 'RegistrationsLive' : 'RegistrationsTest';
    var sheet=book.getSheetByName(name) || book.insertSheet(name);
    var headers=['Internal record - DO NOT EDIT','Invoice reference','Clinic','Customer','Email','Phone','Amount (INR)','Currency','Status','Razorpay order','Payment ID','Paid at (UTC)','Email status','Address','City','State','PIN','Agreement version'];
    if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);sheet.hideColumns(1);}
    if(sheet.getRange(1,1).getValue()!==headers[0]) throw new Error('Unexpected sheet schema');
    var count=sheet.getLastRow()-1;
    if(count>2000) throw new Error('Storage capacity requires review');
    var originals=count ? sheet.getRange(2,1,count,1).getValues().map(function(row){return row[0];}) : [];
    var records=originals.map(function(text){return JSON.parse(text);});
    var value=applySheetAction(records,request.action,request.payload,Date.now());
    records.forEach(function(r,index){
      var json=JSON.stringify(r);
      if(json.length>45000) throw new Error('Record exceeds sheet capacity');
      if(json===originals[index]) return;
      var details=r.client_details ? JSON.parse(r.client_details) : {};
      var cells=[json,r.reference,details.clinicName || '',r.customer_name || '',r.customer_email || '',details.phone || '',r.amount/100,r.currency,r.state,r.order_id || '',r.payment_id || '',r.paid_at ? new Date(r.paid_at).toISOString() : '',r.email_status,[details.addressLine1,details.addressLine2].filter(Boolean).join(', '),details.city || '',details.state || '',details.postalCode || '',r.acceptance ? r.acceptance.version : ''];
      // Plain strings only, including customer values that begin with formula characters.
      cells=cells.map(function(v){return typeof v==='string' && /^[=+\-@]/.test(v) ? "'"+v : v;});
      sheet.getRange(index+2,1,1,cells.length).setValues([cells]);
    });
    SpreadsheetApp.flush();
    return reply_({ok:true,value:value});
  } catch(error) {
    return reply_({ok:false,status:error.status || 503,error:error.status ? error.message : 'Storage request failed'});
  } finally {if(lock && lock.hasLock()) lock.releaseLock();}
}
function reply_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
