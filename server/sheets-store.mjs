import {createHmac, randomUUID} from 'node:crypto';

export function createSheetStore(config, fetcher = fetch) {
  return async (action, payload = {}) => {
    if (!config.sheetStore.url || !config.sheetStore.secret) {
      const error=new Error('Google Sheets storage is not configured. Follow deploy/GOOGLE-SHEETS-SETUP.md.'); error.status=503; throw error;
    }
    const packet=JSON.stringify({action,payload:{...payload,environment:config.environment},timestamp:Date.now(),nonce:randomUUID()});
    const signature=createHmac('sha256',config.sheetStore.secret).update(packet).digest('hex');
    let result;
    try {
      const response=await fetcher(config.sheetStore.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet,signature}),signal:AbortSignal.timeout(15000),redirect:'follow'});
      if (!response.ok) throw new Error('Storage unavailable');
      result=await response.json();
    } catch {const error=new Error('Payment records are temporarily unavailable. Please retry; do not make another payment.');error.status=503;throw error;}
    if (result.ok!==true) {
      const error=new Error(result.status>=400 && result.status<500 && typeof result.error==='string' ? result.error : 'Payment records are temporarily unavailable. Please contact Tootica.');
      error.status=Number.isInteger(result.status) && result.status>=400 && result.status<=599 ? result.status : 503;throw error;
    }
    return result.value;
  };
}
