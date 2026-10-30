import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {applySheetAction} from '../server/sheet-state.mjs';
import {createSheetsApp} from '../server/sheets-app.mjs';

export function memorySheetStore(environment='test') {
  const records=[];
  const store=async(action,payload={})=>{
    const copy=structuredClone(records);
    const value=applySheetAction(copy,action,{...payload,environment});
    records.splice(0,records.length,...copy);
    return structuredClone(value);
  };
  return {records,store};
}
export function sheetTestServer({config,store,provider,sendEmail}) {
  return createServer(async(req,res)=>{
    if(req.url.startsWith('/api/') || req.url==='/payment-config.json') {
      const request=new Request(new URL(req.url,config.origin),{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await createSheetsApp({config,store,provider,sendEmail}).handle(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      try {const path=new URL(req.url,config.origin).pathname;const file=new URL('../dist'+(path==='/'?'/index.html':path),import.meta.url);const body=await readFile(file);res.setHeader('Content-Type',path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.json')?'application/json':'text/html');res.end(body);}catch{res.writeHead(404);res.end();}
    }
  });
}
