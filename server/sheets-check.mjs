import {loadConfig} from './config.mjs';
import {createSheetStore} from './sheets-store.mjs';
try {
  const result=await createSheetStore(loadConfig())('ping');
  if(!result?.ready) throw new Error('Unexpected reply');
  console.log('Google Sheets connection authenticated. No registration or payment was created.');
} catch {console.error('Google Sheets connection is not ready. Check deploy/GOOGLE-SHEETS-SETUP.md, the /exec URL, Script Properties and deployed version.');process.exitCode=1;}
