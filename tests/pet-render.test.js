import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPetPack,PET_TIMINGS,PET_PALETTES} from '../src/pet-pack.js';
import {petPreview} from '../src/pet-preview.js';

test('native LCD rows match browser for all new poses, stages and palettes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'athena-render-'));
 try{
 writeFileSync(join(dir,'qp.h'),`#include <stdbool.h>
#include <stdint.h>
typedef void *painter_font_handle_t;
bool qp_viewport(const void *,int,int,int,int);
bool qp_pixdata(const void *,const void *,uint32_t);
void qp_drawtext(const void *,int,int,void *,const char *);
void qp_rect(const void *,int,int,int,int,int,int,int,bool);
void qp_flush(const void *);
`);
 writeFileSync(join(dir,'timer.h'),'#include <stdint.h>\nuint32_t timer_read32(void);\n');
 writeFileSync(join(dir,'harness.c'),`#include "pet.h"
#include "screen_upload.h"
#include <stdio.h>
#include <string.h>
#include <assert.h>
#include <stdlib.h>
static uint8_t flash[14336],screen[32768];static unsigned cursor;static uint32_t now;static pet_status_t state;
void *my_font;
const uint8_t *su_flash_ptr(uint32_t off){assert(off==0xa00000);return flash;}
uint32_t su_millis(void){return now;}uint32_t timer_read32(void){return now;}
bool su_flash_erase(uint32_t o){(void)o;return false;}bool su_flash_program(uint32_t o,const uint8_t *p){(void)o;(void)p;return false;}
bool su_busy(void){return false;}uint32_t su_crc32(uint32_t c,const uint8_t *p,size_t n){(void)p;(void)n;return c;}
void pet_status(pet_status_t *out){*out=state;}
bool qp_viewport(const void *d,int x,int y,int r,int b){(void)d;assert(x==0&&y==0&&r==127&&b==127);cursor=0;return true;}
bool qp_pixdata(const void *d,const void *p,uint32_t n){(void)d;assert(n==128&&cursor+n*2<=sizeof screen);memcpy(screen+cursor,p,n*2);cursor+=n*2;return true;}
void qp_drawtext(const void *d,int x,int y,void *f,const char *s){(void)d;(void)f;(void)s;assert(x>=0&&y<128);}
void qp_rect(const void *d,int x,int y,int r,int b,int h,int s,int v,bool fill){(void)d;(void)h;(void)s;(void)v;(void)fill;assert(x>=0&&r<128&&y>=0&&b<128);}
void qp_flush(const void *d){(void)d;assert(cursor==sizeof screen);}
int main(int argc,char **argv){assert(argc==5);FILE *f=fopen(argv[1],"rb");assert(f&&fread(flash,1,sizeof flash,f)==sizeof flash);fclose(f);assert(pet_pack_header_valid(flash));
 state.ready=1;state.level=atoi(argv[2]);state.xp=atoi(argv[3]);state.fullness=atoi(argv[4]);
 for(unsigned stage=0;stage<3;stage++)for(unsigned a=0;a<8;a++){unsigned elapsed=0;for(unsigned frame=0;frame<flash[24+a];frame++){
 unsigned off=96+a*16+frame*2,ms=flash[off]|flash[off+1]<<8;now=elapsed+ms/2;state.stage=stage;state.action=a;state.action_started=0;state.jump=pet_lift(flash,a,now);pet_render(NULL,true);fwrite(screen,1,sizeof screen,stdout);elapsed+=ms;}}
}
`);
 const flags=['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-I',resolve('firmware/v2/src'),'-I',dir];
 execFileSync('cc',[...flags,'-Dpet_status=core_pet_status','-c','firmware/v2/src/pet.c','-o',join(dir,'pet.o')]);
 execFileSync('cc',[...flags,join(dir,'harness.c'),'firmware/v2/src/pet_render.c','firmware/v2/src/typing.c',join(dir,'pet.o'),'-o',join(dir,'render')]);
 for(const theme of Object.keys(PET_PALETTES))for(const stats of (theme==='mint'?[{level:1,xp:0,fullness:80},{level:2,xp:399,fullness:25},{level:20,xp:3800,fullness:0}]:[{level:1,xp:0,fullness:80}])){
  const pack=createPetPack(theme);writeFileSync(join(dir,'pet.bin'),pack);
  const actual=execFileSync(join(dir,'render'),[join(dir,'pet.bin'),String(stats.level),String(stats.xp),String(stats.fullness)],{maxBuffer:16*1024*1024});let offset=0;
  for(let stage=0;stage<3;stage++)for(let a=0;a<8;a++){let elapsed=0;for(const ms of PET_TIMINGS[a]){
   const rgba=petPreview(pack,a,elapsed+Math.floor(ms/2),stage,0,stats),expected=Buffer.alloc(32768);
   for(let i=0;i<16384;i++){const j=i*4,c=rgba[j+3]?((Math.round(rgba[j]*31/255)<<11)|(Math.round(rgba[j+1]*63/255)<<5)|Math.round(rgba[j+2]*31/255)):0;expected.writeUInt16BE(c,i*2);}
   assert.deepEqual(actual.subarray(offset,offset+32768),expected,`${theme} stage ${stage} action ${a} time ${elapsed}`);offset+=32768;elapsed+=ms;
  }}assert.equal(offset,actual.length);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
