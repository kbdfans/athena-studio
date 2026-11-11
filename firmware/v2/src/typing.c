// SPDX-License-Identifier: GPL-2.0-or-later
#include "typing.h"
#include <string.h>
// Atomic words + sequence counter publish one coherent configuration across cores.
static uint32_t setting_words[4]={0x01020102u,0x2124fa80u,0x9b073b8bu,0xe6f9ffddu},setting_seq;
void typing_settings_default(typing_settings *s){*s=(typing_settings){2,1,2,1,{0xfa80,0x2124,0x3b8b,0x9b07},0xffdd,0xe6f9};}
bool typing_settings_valid(const typing_settings *s){return s->version==2&&s->size<3&&s->weight<3&&s->mode<3;}
uint32_t typing_settings_get(typing_settings *s){
 for(;;){uint32_t seq=__atomic_load_n(&setting_seq,__ATOMIC_ACQUIRE);if(seq&1)continue;uint32_t words[4];
  for(unsigned i=0;i<4;i++)words[i]=__atomic_load_n(&setting_words[i],__ATOMIC_ACQUIRE);
  if(seq==__atomic_load_n(&setting_seq,__ATOMIC_ACQUIRE)){memcpy(s,words,sizeof *s);return seq;}
 }
}
bool typing_settings_set(const typing_settings *s){
 if(!typing_settings_valid(s))return false;
 typing_settings current;uint32_t seq=typing_settings_get(&current);if(!memcmp(s,&current,sizeof *s))return true;
 uint32_t words[4];memcpy(words,s,sizeof *s);__atomic_store_n(&setting_seq,seq+1,__ATOMIC_RELEASE);
 for(unsigned i=0;i<4;i++)__atomic_store_n(&setting_words[i],words[i],__ATOMIC_RELEASE);
 __atomic_store_n(&setting_seq,seq+2,__ATOMIC_RELEASE);return true;
}
uint8_t typing_color_class(uint8_t ch,uint8_t mode,uint8_t random){
 if(mode==0)return 0;
 if(mode==1)return random%4;
 return ch>='A'&&ch<='Z'?0:ch>='0'&&ch<='9'?1:2;
}
static uint32_t rand32(typing_world *w){uint32_t x=w->rng;x^=x<<13;x^=x>>17;x^=x<<5;return w->rng=x;}
static uint32_t isqrt(uint32_t n){uint32_t r=0,b=1u<<30;while(b>n)b>>=2;while(b){if(n>=r+b){n-=r+b;r=(r>>1)+b;}else r>>=1;b>>=2;}return r;}
void typing_init(typing_world *w,uint32_t seed){memset(w,0,sizeof *w);w->rng=seed?seed:0x41544845;typing_settings_get(&w->settings);}
void typing_spawn(typing_world *w,uint8_t ch,uint32_t now){
 if(ch>='a'&&ch<='z')ch-=32;
 if(ch<33||ch>126)return;
 uint32_t elapsed=w->has_shot?(uint32_t)(now-w->last_shot):800;w->last_shot=now;w->has_shot=true;
 uint32_t power=elapsed>=800?0:800-elapsed,speed=(50+125*power/800)*TYPE_Q;
 // Random upward cone: normalize a random horizontal component, always upward.
 int32_t dx=(int32_t)(rand32(w)%401)-200,dy=-120;uint32_t norm=isqrt((uint32_t)(dx*dx+dy*dy));
 if(w->count>=12)for(unsigned i=0;i<w->count-11;i++)if(w->balls[i].life>180)w->balls[i].life=180;
 if(w->count==TYPE_MAX){memmove(w->balls,w->balls+1,(TYPE_MAX-1)*sizeof(typing_ball));w->count--;}
 uint8_t radius=8+2*w->settings.size;
 typing_ball *p=&w->balls[w->count++];*p=(typing_ball){64*TYPE_Q,(126-radius)*TYPE_Q,dx*(int32_t)speed/(int32_t)norm,dy*(int32_t)speed/(int32_t)norm,5000,ch,typing_color_class(ch,w->settings.mode,rand32(w)%4),radius};
}
void typing_collide(typing_ball *a,typing_ball *b){
 int32_t reach=(a->radius+b->radius)*TYPE_Q;
 int32_t dx=b->x-a->x,dy=b->y-a->y;if(dx>=reach||dx<=-reach||dy>=reach||dy<=-reach)return;uint32_t d2=(uint32_t)(dx*dx+dy*dy);if(d2>=(uint32_t)(reach*reach))return;
 int32_t d=(int32_t)isqrt(d2),nx=d?dx*TYPE_Q/d:TYPE_Q,ny=d?dy*TYPE_Q/d:0,push=(reach-d+3)/2;
 a->x-=nx*push/TYPE_Q;a->y-=ny*push/TYPE_Q;b->x+=nx*push/TYPE_Q;b->y+=ny*push/TYPE_Q;
 int32_t toward=((a->vx-b->vx)*nx+(a->vy-b->vy)*ny)/TYPE_Q;
 if(toward>0){int32_t impulse=toward*96/100;a->vx-=impulse*nx/TYPE_Q;a->vy-=impulse*ny/TYPE_Q;b->vx+=impulse*nx/TYPE_Q;b->vy+=impulse*ny/TYPE_Q;}
}
static void contain(typing_ball *p){
 int32_t LO=(2+p->radius)*TYPE_Q,HI=(126-p->radius)*TYPE_Q;
 if(p->vx>220*TYPE_Q)p->vx=220*TYPE_Q;
 if(p->vx<-220*TYPE_Q)p->vx=-220*TYPE_Q;
 if(p->vy>220*TYPE_Q)p->vy=220*TYPE_Q;
 if(p->vy<-220*TYPE_Q)p->vy=-220*TYPE_Q;
 if(p->x<LO){p->x=LO;if(p->vx<0)p->vx=-p->vx*94/100;}else if(p->x>HI){p->x=HI;if(p->vx>0)p->vx=-p->vx*94/100;}
 if(p->y<LO){p->y=LO;if(p->vy<0)p->vy=-p->vy*94/100;}else if(p->y>HI){p->y=HI;if(p->vy>0)p->vy=-p->vy*94/100;}
}
void typing_step(typing_world *w,uint32_t ms){
 while(ms){uint32_t dt=ms>8?8:ms;ms-=dt;
  for(unsigned i=0;i<w->count;){typing_ball *p=&w->balls[i];if(p->life<=dt){memmove(p,p+1,(--w->count-i)*sizeof *p);continue;}
   p->life-=dt;p->x+=p->vx*(int32_t)dt/1000;p->y+=p->vy*(int32_t)dt/1000;p->vx=p->vx*(10000-(int32_t)dt)/10000;p->vy=p->vy*(10000-(int32_t)dt)/10000;i++;
  }
  for(unsigned pass=0;pass<3;pass++){for(unsigned i=0;i<w->count;i++)for(unsigned j=i+1;j<w->count;j++)typing_collide(&w->balls[i],&w->balls[j]);for(unsigned i=0;i<w->count;i++)contain(&w->balls[i]);}
 }
}
uint8_t typing_ascii(uint16_t k,uint8_t mods){
 if(mods&0xdd)return 0;
 bool shift=mods&0x22;
 if(k>=4&&k<=29)return 'A'+k-4;
 if(k>=30&&k<=39)return (shift?"!@#$%^&*()":"1234567890")[k-30];
 if(k>=45&&k<=56)return (shift?"_+{}|~:\"~<>?":"-=[]\\#;'`,./")[k-45];
 if(k>=89&&k<=97)return '1'+k-89;
 if(k==98)return '0';
 if(k==99)return '.';
 if(k>=84&&k<=87)return "/*-+"[k-84];
 return 0;
}
// SPSC queue: only core 0 produces; only the display core consumes. Epochs discard
// events from previous modes without either core modifying the other's index.
static struct {uint32_t time,epoch;uint8_t glyph;} events[32];
static uint32_t head,tail,epoch;
void typing_clear(void){uint32_t e=__atomic_load_n(&epoch,__ATOMIC_RELAXED);__atomic_store_n(&epoch,e+1,__ATOMIC_RELEASE);}
void typing_key(uint16_t key,uint8_t mods,uint32_t now){
 uint8_t ch=typing_ascii(key,mods);if(!ch)return;uint32_t h=__atomic_load_n(&head,__ATOMIC_RELAXED),t=__atomic_load_n(&tail,__ATOMIC_ACQUIRE);if(h-t>=32)return;
 events[h%32].glyph=ch;events[h%32].time=now;events[h%32].epoch=__atomic_load_n(&epoch,__ATOMIC_ACQUIRE);__atomic_store_n(&head,h+1,__ATOMIC_RELEASE);
}
bool typing_pop(uint8_t *ch,uint32_t *time){
 for(;;){uint32_t t=__atomic_load_n(&tail,__ATOMIC_RELAXED),h=__atomic_load_n(&head,__ATOMIC_ACQUIRE);if(t==h)return false;
  uint8_t c=events[t%32].glyph;uint32_t stamp=events[t%32].time,e=events[t%32].epoch;__atomic_store_n(&tail,t+1,__ATOMIC_RELEASE);
  if(e==__atomic_load_n(&epoch,__ATOMIC_ACQUIRE)){*ch=c;*time=stamp;return true;}
 }
}
