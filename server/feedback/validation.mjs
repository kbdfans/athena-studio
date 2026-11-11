export const EVENTS = new Set(['page.open','connection.request','connection.ready','connection.failed','connection.closed','view.keymap','view.screen','view.tester','view.firmware','demo.enter','demo.exit','image.prepare','image.write','image.complete','image.failed','keymap.change','pet.settings','typing.settings','runtime.error']);
export const MODELS = new Set(['athena75','athena1800','other']);
export const STATUSES = new Set(['new','investigating','resolved']);
const plain=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function cleanDiagnostics(value){
 if(!value||typeof value!=='object')return null;
 const environment={};for(const k of ['browser','os','language','version'])environment[k]=plain(value.environment?.[k],80).replace(/[\r\n]/g,' ');
 environment.viewport=plain(value.environment?.viewport,24).replace(/[^0-9x ]/g,'');
 const events=(Array.isArray(value.events)?value.events:[]).slice(-100).filter(e=>e&&EVENTS.has(e.event)).map(e=>({event:e.event,at:Math.max(0,Math.min(86400000,Number(e.at)||0)),...(Number.isInteger(e.line)?{line:Math.max(0,Math.min(e.line,100000))}:{})}));
 return {environment,events};
}
export function validateReport(body){
 if(!body||!MODELS.has(body.model))throw new Error('MODEL');
 const description=plain(body.description,4001);if(description.length<5||description.length>4000)throw new Error('DESCRIPTION');
 const modelName=body.model==='other'?plain(body.modelName,80):body.model==='athena75'?'Athena75':'Athena1800';if(!modelName)throw new Error('MODEL');
 const screenshots=body.screenshots??[];if(!Array.isArray(screenshots)||screenshots.length>3)throw new Error('SCREENSHOT');
 const images=screenshots.map(s=>{
  if(typeof s!=='string'||s.length>1450000)throw new Error('SCREENSHOT');
  const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);if(!m)throw new Error('SCREENSHOT');
  const b=Buffer.from(m[2],'base64');if(b.length>1048576||b.length<12)throw new Error('SCREENSHOT');
  const valid=m[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?b[0]===255&&b[1]===216&&b[2]===255:b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  if(!valid)throw new Error('SCREENSHOT');return s;
 });
 if(!/^[a-f0-9-]{36}$/.test(body.requestId||''))throw new Error('REQUEST_ID');
 return {requestId:body.requestId,model:body.model,modelName,description,screenshots:images,diagnostics:cleanDiagnostics(body.diagnostics)};
}
