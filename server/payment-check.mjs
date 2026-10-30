import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadConfig} from './config.mjs';

export async function checkPaymentConnection(config, fetcher = fetch) {
  if (!config.keyId || !config.keySecret) return {ok:false,status:null,message:'Configure both Razorpay key ID and secret in the server environment.'};
  try {
    const response = await fetcher('https://api.razorpay.com/v1/orders?count=1', {
      headers:{Authorization:'Basic ' + Buffer.from(config.keyId + ':' + config.keySecret).toString('base64'),Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(15000)
    });
    if (response.status === 401 || response.status === 403) return {ok:false,status:response.status,message:'Razorpay rejected this key pair. Update both values from the same active dashboard key and restart the server.'};
    if (!response.ok) return {ok:false,status:response.status,message:'Razorpay is unavailable or rejected the connection check. Please retry later.'};
    const body = await response.json();
    if (!Array.isArray(body.items)) return {ok:false,status:response.status,message:'Razorpay returned an unexpected response.'};
    return {ok:true,status:response.status,message:'Razorpay credentials authenticated. No payment was created or charged.'};
  } catch {
    return {ok:false,status:null,message:'Could not reach Razorpay. Check server network access and retry.'};
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const fingerprint = createHash('sha256').update(config.keyId).digest('hex').slice(0,12);
  console.log('Payment environment: ' + config.environment + '. Public key fingerprint: ' + fingerprint);
  const result = await checkPaymentConnection(config);
  console.log((result.status ? 'HTTP ' + result.status + ': ' : '') + result.message);
  if (!result.ok) process.exitCode=1;
  try {
    const response = await fetch(config.origin + '/payment-config.json',{redirect:'error',signal:AbortSignal.timeout(3000),cache:'no-store'});
    const running = await response.json();
    if (running.keyFingerprint !== fingerprint) {
      console.log('The running server has different or older settings. Restart npm start to load the current .env.');
      process.exitCode=1;
    } else console.log('The running server public key matches this configuration.');
  } catch {console.log('No running server configuration could be checked. Start the server after updating .env.');}
}
