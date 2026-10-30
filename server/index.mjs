import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Readable} from 'node:stream';
import {loadConfig} from './config.mjs';
import {createSheetsApp} from './sheets-app.mjs';

const config=loadConfig(),app=createSheetsApp({config});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.otf':'font/otf','.txt':'text/plain'};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,config.origin);
    if(url.pathname.startsWith('/api/') || url.pathname==='/payment-config.json') {
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await app.handle(request,{ip:req.socket.remoteAddress});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
    const path=decodeURIComponent(url.pathname);
    if(path.includes(String.fromCharCode(92)) || path.includes(String.fromCharCode(0)) || path.split('/').some(p=>p.startsWith('.'))) throw new Error('Invalid path');
    const file=resolve(config.staticDir,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(resolve(config.staticDir)+sep) || !mime[extname(file)]) throw new Error('Invalid path');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port is already in use. Stop the existing server before restarting.':'Server could not start.');process.exitCode=1;});
server.listen(config.port,config.host,()=>console.log(`Tootica listening at ${config.origin}. Storage: Google Sheets${config.sheetStore.url?'':' (setup required)'}. Payments ${config.environment}.`));
const timer=setInterval(()=>{void app.runDeliveries(1).catch(()=>console.error('Email retry needs review; no sensitive data logged.'));},60000);timer.unref();
function stop(){clearInterval(timer);server.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
