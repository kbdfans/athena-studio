#include "typing.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
static long long energy(typing_ball *p){return (long long)p->vx*p->vx+(long long)p->vy*p->vy;}
int main(void){
 typing_world w;typing_init(&w,1);typing_spawn(&w,'a',0);assert(w.count==1&&w.balls[0].glyph=='A'&&w.balls[0].x==64*256&&w.balls[0].vy<0);long long slow=energy(&w.balls[0]);typing_spawn(&w,'b',80);assert(energy(&w.balls[1])>slow*4);typing_spawn(&w,'c',9000);assert(energy(&w.balls[2])<slow*2);
 typing_ball a={50*256,64*256,100*256,0,5000,'A',0,10},b={69*256,64*256,-100*256,0,5000,'B',0,10};long long before=energy(&a)+energy(&b);typing_collide(&a,&b);assert(a.vx<0&&b.vx>0&&b.x-a.x>=20*256);assert(energy(&a)+energy(&b)<=before);
 typing_init(&w,2);w.count=2;w.balls[0]=(typing_ball){40*256,64*256,175*256,0,5000,'A',0,10};w.balls[1]=(typing_ball){65*256,64*256,-175*256,0,5000,'B',0,10};typing_step(&w,40);assert(w.balls[0].vx<0&&w.balls[1].vx>0);
 // Stress random, crowded launches, high velocity and rollover under UBSan.
 for(unsigned seed=1;seed<50;seed++){
  typing_settings settings;typing_settings_default(&settings);settings.size=seed%3;settings.weight=(seed/3)%3;settings.mode=(seed/9)%3;assert(typing_settings_set(&settings));
  typing_init(&w,seed);for(unsigned i=0;i<1500;i++){if(i%3==0)typing_spawn(&w,'a'+i%26,0xfffff000u+i*8);typing_step(&w,8);assert(w.count<=16);
   for(unsigned j=0;j<w.count;j++){typing_ball *p=&w.balls[j];assert(p->x>=(2+p->radius)*256&&p->x<=(126-p->radius)*256&&p->y>=(2+p->radius)*256&&p->y<=(126-p->radius)*256);assert(abs(p->vx)<60000&&abs(p->vy)<60000);}
  }typing_step(&w,6000);assert(w.count==0);
 }
 assert(typing_ascii(4,0)=='A'&&typing_ascii(29,0)=='Z'&&typing_ascii(30,2)=='!'&&typing_ascii(45,2)=='_');assert(!typing_ascii(4,1)&&!typing_ascii(4,8)&&!typing_ascii(44,0));assert(typing_ascii(89,0)=='1');
 assert(typing_color_class('A',2,3)==0&&typing_color_class('9',2,3)==1&&typing_color_class('?',2,0)==2&&typing_color_class('A',0,3)==0);
 typing_settings bad;typing_settings_default(&bad);bad.size=3;assert(!typing_settings_set(&bad));
 uint8_t ch;uint32_t t;typing_clear();typing_key(4,0,10);typing_clear();typing_key(5,0,20);assert(typing_pop(&ch,&t)&&ch=='B'&&t==20);assert(!typing_pop(&ch,&t));
 for(unsigned i=0;i<40;i++)typing_key(4,0,i);unsigned count=0;while(typing_pop(&ch,&t))count++;assert(count==32);typing_key(6,0,50);assert(typing_pop(&ch,&t)&&ch=='C');
 printf("PASS typing: collisions, fast motion, crowded stress, bounds, rate, expiry, mapping and queue epochs. World=%zu bytes\n",sizeof w);
}
