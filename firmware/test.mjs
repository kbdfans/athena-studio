import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {encodeQgf} from '../src/format.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=mkdtempSync(join(tmpdir(),'athena-protocol-'));
try {
  const fixture=join(dir,'test.qgf'),binary=join(dir,'test');
  writeFileSync(fixture,encodeQgf([{data:new Uint16Array(16384).fill(0xf800),delay:100},{data:new Uint16Array(16384).fill(0x1f),delay:200}],5));
  execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-I',resolve(root,'firmware/src'),resolve(root,'firmware/src/screen_upload.c'),resolve(root,'firmware/tests/upload_test.c'),'-o',binary],{stdio:'inherit'});
  execFileSync(binary,[fixture],{stdio:'inherit'});
} finally {rmSync(dir,{recursive:true,force:true});}
