import http from 'node:http';
import {mkdir,readdir,readFile,open,rename,unlink,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {validateReport,STATUSES} from './validation.mjs';
const MAX_BODY=4500000,MAX_STORAGE=512*1024*1024;
export async function createFeedbackServer({directory,origins=['https://kbd.cool','https://v.kbd.cool','https://www.kbd.cool'],authorize,trustProxy=false,rateLimit=10}={}){
 if(!directory||typeof authorize!=='function')throw Error('Storage and administrator authorization required');
 await mkdir(directory,{recursive:true,mode:0o700});
 const rates=new Map();let queue=Promise.resolve();
 const locked=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 const path=id=>join(directory,id+'.json');
 const records=async()=>{const names=(await readdir(directory)).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n));return names;};
 const write=async(id,value)=>{const tmp=join(directory,randomUUID()+'.tmp'),f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}await rename(tmp,path(id));const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}};
 return http.createServer(async(req,res)=>{
  const origin=req.headers.origin,url=new URL(req.url,'http://localhost'),prefix='/studio/api/feedback';
  const send=(code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
  if(origin&&origins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
  if(req.method==='OPTIONS'){res.statusCode=origin&&origins.includes(origin)?204:403;res.end();return;}
  const body=async()=>{if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(Error('JSON_REQUIRED'),{status:415});let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>MAX_BODY)throw Object.assign(Error('TOO_LARGE'),{status:413});chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw Object.assign(Error('INVALID_JSON'),{status:400});}};
  try{
   if(url.pathname===prefix+'/health'&&req.method==='GET'){send(200,{ok:true});return;}
   if(url.pathname===prefix&&req.method==='POST'){
    if(!origin||!origins.includes(origin)){send(403,{error:'ORIGIN'});return;}
    const ip=trustProxy?String(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
    const key=createHash('sha256').update(String(ip)).digest('hex'),now=Date.now();for(const[k,v]of rates)if(v.until<now)rates.delete(k);
    const rate=rates.get(key)||{count:0,until:now+3600000};if(rate.count>=rateLimit||rates.size>10000){res.setHeader('Retry-After','3600');send(429,{error:'RATE_LIMIT'});return;}rate.count++;rates.set(key,rate);
    let value;try{value=validateReport(await body());}catch(e){if(!e.status)e.status=400;throw e;}
    const id=await locked(async()=>{
     const names=await records();let size=0;
     for(const name of names){size+=(await stat(join(directory,name))).size;const report=JSON.parse(await readFile(join(directory,name),'utf8'));if(report.requestId===value.requestId)return report.id;}
     if(names.length>=5000||size+Buffer.byteLength(JSON.stringify(value))>MAX_STORAGE)throw Object.assign(Error('INBOX_FULL'),{status:503});
     const id=randomUUID();await write(id,{...value,id,status:'new',createdAt:new Date().toISOString(),site:new URL(origin).hostname});return id;
    });send(201,{ok:true,id});return;
   }
   if(url.pathname.startsWith(prefix+'/admin')){
    // Cross-origin callers can submit only; inbox data and changes require a same-origin admin session.
    if(origin&&origin!==origins[0]){send(403,{error:'ORIGIN'});return;}
    if(!await authorize(req)){send(401,{error:'LOGIN_REQUIRED'});return;}
    if(url.pathname===prefix+'/admin'&&req.method==='GET'){
     const rows=[];for(const name of await records()){const r=JSON.parse(await readFile(join(directory,name),'utf8'));rows.push({id:r.id,model:r.model,modelName:r.modelName,status:r.status,createdAt:r.createdAt,site:r.site,description:r.description,screenshots:r.screenshots.length,hasLogs:!!r.diagnostics});}
     const status=url.searchParams.get('status'),model=url.searchParams.get('model'),q=(url.searchParams.get('q')||'').slice(0,100).toLowerCase();
     const filtered=rows.filter(r=>(!status||r.status===status)&&(!model||r.model===model)&&(!q||(r.description+' '+r.modelName+' '+r.id).toLowerCase().includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
     const page=Math.max(0,Math.min(10000,parseInt(url.searchParams.get('page'))||0));send(200,{items:filtered.slice(page*50,page*50+50).map(r=>({...r,description:r.description.slice(0,180)})),total:filtered.length,page});return;
    }
    const match=new RegExp('^'+prefix+'/admin/([a-f0-9-]{36})$').exec(url.pathname);if(!match){send(404,{error:'NOT_FOUND'});return;}
    const id=match[1];if(req.method==='GET'){send(200,JSON.parse(await readFile(path(id),'utf8')));return;}
    if(!origin||origin!==origins[0]){send(403,{error:'ORIGIN'});return;}
    if(req.method==='PATCH'){const value=await body();if(!STATUSES.has(value.status)){send(400,{error:'STATUS'});return;}
     await locked(async()=>{const r=JSON.parse(await readFile(path(id),'utf8'));await write(id,{...r,status:value.status,updatedAt:new Date().toISOString()});});send(200,{ok:true});return;}
    if(req.method==='DELETE'){await locked(()=>unlink(path(id)));send(200,{ok:true});return;}
   }
   send(404,{error:'NOT_FOUND'});
  }catch(e){const code=e.code==='ENOENT'?404:e.status||500;send(code,{error:code===500?'SERVER_ERROR':e.message});}
 });
}
export function sessionAuthorizer(url,origin){return async req=>{
 try{const r=await fetch(url,{headers:{Cookie:req.headers.cookie||'',Origin:origin},redirect:'error',signal:AbortSignal.timeout(4000)});if(!r.ok)return false;const v=await r.json();return v.ok===true&&typeof v.user==='string';}catch{return false;}
};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const origin=process.env.FEEDBACK_ADMIN_ORIGIN||'https://kbd.cool';
 const server=await createFeedbackServer({directory:process.env.FEEDBACK_DATA_DIR||'/data',origins:[origin,'https://v.kbd.cool','https://www.kbd.cool'],trustProxy:process.env.FEEDBACK_TRUST_PROXY==='1',authorize:sessionAuthorizer(process.env.FEEDBACK_AUTH_URL||'http://127.0.0.1:5174/api/admin/session',origin)});
 server.listen(Number(process.env.PORT||8771),process.env.HOST||'127.0.0.1');
}
