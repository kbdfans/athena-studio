import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'athena-typing-'));
try{
 const flags=['-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined','-I',resolve('firmware/v2/src')];
 const physics=join(dir,'physics');execFileSync('cc',[...flags,'firmware/v2/src/typing.c','firmware/v2/tests/typing_test.c','-o',physics],{stdio:'inherit'});execFileSync(physics,[],{stdio:'inherit'});
 writeFileSync(join(dir,'qp.h'),'#include <stdint.h>\n#include <stdbool.h>\nbool qp_viewport(const void*,uint16_t,uint16_t,uint16_t,uint16_t);\nbool qp_pixdata(const void*,const void*,uint32_t);\nvoid qp_flush(const void*);\n');
 writeFileSync(join(dir,'timer.h'),'#include <stdint.h>\nuint32_t timer_read32(void);\n');
 writeFileSync(join(dir,'render.c'),`#include "typing.h"
#include "qp.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static uint32_t now,pos,frames;static unsigned char output[32768];
uint32_t timer_read32(void){return now;}
bool qp_viewport(const void*d,uint16_t x,uint16_t y,uint16_t r,uint16_t b){(void)d;assert(x==0&&y==0&&r==127&&b==127);pos=0;return true;}
bool qp_pixdata(const void*d,const void*p,uint32_t n){(void)d;assert(n==128&&pos+n*2<=sizeof output);memcpy(output+pos,p,n*2);pos+=n*2;return true;}
void qp_flush(const void*d){(void)d;assert(pos==sizeof output);frames++;for(unsigned y=0;y<128;y++)for(unsigned x=0;x<128;x++)if(x<2||x>=126||y<2||y>=126){unsigned p=(y*128+x)*2;assert(output[p]==0x18&&output[p+1]==0xe3);}}
static void check_background(const typing_settings *s){
 for(unsigned y=2;y<126;y++)for(unsigned x=2;x<126;x++){unsigned p=(y*128+x)*2;uint16_t expected=(x%16==0||y%16==0)?s->grid:s->background;assert((((uint16_t)output[p]<<8)|output[p+1])==expected);}
}
int main(int argc,char**argv){
 assert(argc==2);typing_settings s;typing_settings_default(&s);typing_render(0,true);check_background(&s);unsigned initial=frames;now=34;typing_render(0,false);assert(frames==initial);
 for(unsigned size=0;size<3;size++)for(unsigned weight=0;weight<3;weight++)for(unsigned mode=0;mode<3;mode++){
  s.size=size;s.weight=weight;s.mode=mode;s.background=0xffdd;s.grid=0xe6f9;assert(typing_settings_set(&s));now+=34;typing_render(0,false);check_background(&s);
  for(unsigned i=0;i<180;i++){now+=34;if(i%2==0)typing_key(4+i%52,0,now);typing_render(0,false);if(size==1&&weight==2&&mode==1&&i==90){FILE*f=fopen(argv[1],"wb");assert(f);assert(fwrite(output,1,sizeof output,f)==sizeof output);fclose(f);}}
  now+=6000;typing_render(0,true);check_background(&s);
 }
 assert(frames>2700);
 s.background=0x1234;s.grid=0xabcd;assert(typing_settings_set(&s));now+=34;typing_render(0,false);check_background(&s);
 puts("PASS all 27 font/color combinations: glyph bounds, stable border, idle skip, RGB565 custom grid and clearing");
}
`);
 const renderer=join(dir,'render');execFileSync('cc',[...flags,'-I',dir,'firmware/v2/src/typing.c','firmware/v2/src/typing_render.c',join(dir,'render.c'),'-o',renderer],{stdio:'inherit'});mkdirSync('.artifacts',{recursive:true});execFileSync(renderer,[resolve('.artifacts/typing-firmware-frame.rgb565')],{stdio:'inherit'});
}finally{rmSync(dir,{recursive:true,force:true});}
