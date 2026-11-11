import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {encodeQgf} from '../../src/format-v2.js';
import {createPetPack} from '../../src/pet-pack.js';
import {crc32} from '../../src/crc32.js';
const dir=mkdtempSync(join(tmpdir(),'athena-v2-'));
try {
 const display=join(dir,'display-test');
 execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-I',resolve('firmware/v2/src'),resolve('firmware/v2/src/display_lifecycle.c'),resolve('firmware/v2/tests/display_lifecycle_test.c'),'-o',display],{stdio:'inherit'});
 execFileSync(display,[],{stdio:'inherit'});execFileSync(display,['saved-off'],{stdio:'inherit'});
 const image=join(dir,'image.qgf'),pet=join(dir,'pet.pt32'),binary=join(dir,'pet-test');
 writeFileSync(image,encodeQgf([{data:new Uint16Array(16384).fill(0xf800),delay:100}],0));
 writeFileSync(pet,createPetPack());
 execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-I',resolve('firmware/v2/src'),resolve('firmware/v2/src/screen_upload.c'),resolve('firmware/v2/src/pet.c'),resolve('firmware/v2/src/typing.c'),resolve('firmware/v2/src/screen_keys.c'),resolve('firmware/v2/tests/pet_test.c'),'-o',binary],{stdio:'inherit'});
 execFileSync(binary,[image,pet],{stdio:'inherit'});
 const fast=join(dir,'fast-test');
 execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-DATHENA_FAST_UPLOAD','-I',resolve('firmware/v2/src'),resolve('firmware/v2/src/screen_upload.c'),resolve('firmware/v2/src/pet.c'),resolve('firmware/v2/src/typing.c'),resolve('firmware/v2/tests/fast_test.c'),'-o',fast],{stdio:'inherit'});
 const large=join(dir,'large.qgf');
 writeFileSync(large,encodeQgf(Array.from({length:63},()=>({data:new Uint16Array(16384).fill(0xf800),delay:100})),0));
 execFileSync(fast,[image,String(crc32(readFileSync(image)))],{stdio:'inherit'});
 execFileSync(fast,[large,String(crc32(readFileSync(large)))],{stdio:'inherit'});
}finally{rmSync(dir,{recursive:true,force:true});}
