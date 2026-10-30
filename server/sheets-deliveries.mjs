import {parseArgs} from 'node:util';
import {loadConfig} from './config.mjs';
import {createSheetsApp} from './sheets-app.mjs';
import {createSheetStore} from './sheets-store.mjs';
const {values}=parseArgs({options:{retry:{type:'string'},'confirm-not-delivered':{type:'boolean'}}});
try {
  const config=loadConfig();
  if(values.retry) {
    if(!values['confirm-not-delivered']) throw new Error('Check SMTP provider records first; retry only with --confirm-not-delivered.');
    await createSheetStore(config)('email-retry',{id:values.retry,confirmed:true});
    console.log('Reviewed email queued for retry.');
  } else console.log('Emails delivered: '+await createSheetsApp({config}).runDeliveries(1));
} catch {console.error('Delivery operation failed. Check the Sheet, SMTP configuration and review status. No secrets were logged.');process.exitCode=1;}
