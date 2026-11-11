// SPDX-License-Identifier: GPL-2.0-or-later
#include "typing.h"
#include "typing_font.h"
#include "qp.h"
#include "timer.h"
static typing_world world;
static uint32_t last_frame,last_settings=0xffffffffu;
static uint8_t row[256];

void typing_render(const void *display,bool force){
 typing_settings settings;uint32_t revision=typing_settings_get(&settings);
 if(revision!=last_settings){force=true;last_settings=revision;}
 uint32_t now=timer_read32();if(force){typing_init(&world,now);last_frame=now;}
 uint32_t elapsed=now-last_frame;if(!force&&elapsed<33)return;last_frame=now;
 bool had=world.count;typing_step(&world,elapsed>80?80:elapsed);
 uint8_t ch;uint32_t stamp;bool spawned=false;while(typing_pop(&ch,&stamp)){if((uint32_t)(now-stamp)<500){typing_spawn(&world,ch,stamp);spawned=true;}}
 if(!force&&!had&&!world.count&&!spawned)return;
 settings=world.settings;unsigned width=16+4*settings.size,height=18+4*settings.size,stride=width*height/4;
 const uint8_t *font=typing_fonts[settings.size*3+settings.weight];
 uint8_t palette[4][3];for(unsigned c=0;c<4;c++){uint16_t v=settings.colors[c];palette[c][0]=(v>>11)*255/31;palette[c][1]=((v>>5)&63)*255/63;palette[c][2]=(v&31)*255/31;}
 int left[TYPE_MAX],top[TYPE_MAX];unsigned fade[TYPE_MAX];
 for(unsigned i=0;i<world.count;i++){left[i]=world.balls[i].x/TYPE_Q-(int)width/2;top[i]=world.balls[i].y/TYPE_Q-(int)height/2;fade[i]=world.balls[i].life*255u/5000;}
 if(!qp_viewport(display,0,0,127,127))return;
 for(int y=0;y<128;y++){
  for(int x=0;x<128;x++){uint16_t c=(x%16==0||y%16==0)?settings.grid:settings.background;row[x*2]=c>>8;row[x*2+1]=c;}
  for(unsigned i=0;i<world.count;i++){
   int sy=y-top[i];if(sy<0||sy>=(int)height)continue;typing_ball *p=&world.balls[i];const uint8_t *pixels=font+(p->glyph-33)*stride;
   for(int sx=0;sx<(int)width;sx++){int x=left[i]+sx;if(x<2||x>=126)continue;unsigned bit=sy*width+sx,a=((pixels[bit/4]>>((bit%4)*2))&3)*fade[i]/3;if(!a)continue;
    uint16_t old=((uint16_t)row[x*2]<<8)|row[x*2+1];unsigned r=((old>>11)*255/31),g=(((old>>5)&63)*255/63),b=(old&31)*255/31;
    r=(r*(255-a)+palette[p->color][0]*a)/255;g=(g*(255-a)+palette[p->color][1]*a)/255;b=(b*(255-a)+palette[p->color][2]*a)/255;
    uint16_t c=((r>>3)<<11)|((g>>2)<<5)|(b>>3);row[x*2]=c>>8;row[x*2+1]=c;
   }
  }
  for(int x=0;x<128;x++)if(x<2||x>=126||y<2||y>=126){row[x*2]=0x18;row[x*2+1]=0xe3;}
  if(!qp_pixdata(display,row,128))return;
 }
 qp_flush(display);
}
