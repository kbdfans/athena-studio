// Serve the same hash-verified model packages as production in local development.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('public/firmware/releases.json','utf8'));
await mkdir('.artifacts/firmware-web-test',{recursive:true});
for(const release of manifest.releases){
 const name=release.url.split('/').at(-1);
 if(!/^athena(?:75|1800)-[a-z0-9-]+\.uf2$/.test(name))throw Error('Unexpected firmware filename');
 const data=await readFile('public/firmware/'+name);
 if(createHash('sha256').update(data).digest('hex')!==release.sha256)throw Error('Firmware checksum mismatch');
 await writeFile('.artifacts/firmware-web-test/'+name,data);
 release.url='__firmware-test/'+name;
}
await writeFile('.artifacts/firmware-web-test/releases.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared local firmware packages for '+manifest.releases.map(r=>r.model).join(', '));
