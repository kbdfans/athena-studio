const allowed=new Set(['page.open','connection.request','connection.ready','connection.failed','connection.closed','view.keymap','view.screen','view.tester','view.firmware','demo.enter','demo.exit','image.prepare','image.write','image.complete','image.failed','keymap.change','pet.settings','typing.settings','runtime.error']);
const events=[],start=Date.now();
export function recordDiagnostic(event,detail={}){if(!allowed.has(event))return;events.push({event,at:Math.min(86400000,Date.now()-start),...(Number.isInteger(detail.line)?{line:Math.max(0,Math.min(detail.line,100000))}:{})});if(events.length>100)events.shift();}
export function diagnosticSnapshot(){
 const ua=navigator.userAgent,browser=ua.match(/(Edg|Chrome|Firefox|Version)\/([\d.]+)/),os=/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Mac/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
 return {environment:{browser:browser?`${browser[1]} ${browser[2]}`:'Other',os,language:document.documentElement.lang,viewport:`${innerWidth}x${innerHeight}`,version:'2026.11.11-feedback-r1'},events:events.map(e=>({...e}))};
}
export function startDiagnostics(){
 recordDiagnostic('page.open');
 window.addEventListener('error',e=>recordDiagnostic('runtime.error',{line:e.lineno}));
 window.addEventListener('unhandledrejection',()=>recordDiagnostic('runtime.error'));
 const navigation={'keymap-nav':'view.keymap','screen-nav':'view.screen','tester-nav':'view.tester','firmware-nav':'view.firmware','gate-firmware':'view.firmware','gate-demo':'demo.enter','demo-exit':'demo.exit'};
 document.addEventListener('click',e=>{const id=e.target.closest('button')?.id;if(navigation[id])recordDiagnostic(navigation[id]);if(e.target.closest('#key-choices button'))recordDiagnostic('keymap.change');});
}
