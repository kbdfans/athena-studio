import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from '../src/backup-v2.js';
import {decodeFirmwareUf2,hasModelDescriptor,MAIN_LIMIT} from '../src/firmware-plan.js';
import {DEVICE_PROFILES} from '../src/device-profiles.js';
test('published firmware packages match their models, hashes and known-source allowlists',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/firmware/releases.json',import.meta.url),'utf8'));
 assert.equal(manifest.schema,1);assert.deepEqual(manifest.releases.map(r=>r.model).sort(),['athena1800','athena75']);
 for(const r of manifest.releases){
  assert.equal(r.pid,DEVICE_PROFILES[r.model].pid);
  assert.match(r.url,/^firmware\/athena(?:75|1800)-[a-z0-9-]+\.uf2$/);
  const file=new Uint8Array(await readFile(new URL('../public/'+r.url,import.meta.url)));
  assert.equal(await digest(file),r.sha256);const main=decodeFirmwareUf2(file);
  assert(hasModelDescriptor(main,r.pid));assert(!hasModelDescriptor(main,r.pid===0x2513?0x4100:0x2513));
  const mainHash=await digest(main);assert(r.sources.some(s=>s.layout==='v2'&&s.length===main.length&&s.sha256===mainHash));
  for(const source of r.sources){assert(['legacy','v2'].includes(source.layout));assert(Number.isInteger(source.length)&&source.length>0&&source.length<=MAIN_LIMIT);assert.match(source.sha256,/^[a-f0-9]{64}$/);}
  assert.match(r.source.sha256,/^[a-f0-9]{64}$/);assert(r.source.url.startsWith('https://github.com/kbdfans/athena-studio/releases/download/'));
  assert.equal(r.channel,'preview');
 }
});
