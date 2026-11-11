import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
export default defineConfig(({mode}) => ({
  plugins: [{name:'local-firmware-test',configureServer(server){
    server.middlewares.use((req,res,next)=>{
      const path=req.url?.split('?')[0]||'/';
      if(path==='/'||path==='/index.html'||(path.startsWith('/studio-v2.html')&&path!=='/studio-v2.html')){
        res.statusCode=302;res.setHeader('Location','/studio-v2.html');res.end();return;
      }
      next();
    });
    server.middlewares.use('/__firmware-test' ,async(req,res,next)=>{
      const name=req.url?.split('?')[0]?.slice(1);
      if(!['releases.json','athena1800-screen-r2.uf2'].includes(name)){res.statusCode=404;res.end();return;}
      try{const bytes=await readFile(resolve('.artifacts/firmware-web-test',name));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}
    });
  }}],
  base: mode === 'hosted' ? '/studio/' : '/',
  build: {rollupOptions: {input: mode === 'hosted'
    ? {studio: resolve('studio-v2.html')}
    : {index: resolve('index.html'), legacy: resolve('legacy.html'), studio: resolve('studio-v2.html')}}},
}));
