"""Trace the actual patched board initializer, without accessing hardware."""
from pathlib import Path
import sys,tempfile,subprocess
board=Path(sys.argv[1])/'keyboards/ydkb/athena75'
s=(board/'c1_display.c').read_text();a=s.index('bool qp_gc9107_init(');b=s.index('void display_power_toggle',a)
power_start=s.index('void display_init(void)');power_end=s.index('    screen_phase = 2;',power_start)
power_prefix=s[power_start:power_end]+'}\n'
harness='''#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
#include <stdio.h>
typedef void *painter_device_t;typedef unsigned painter_rotation_t;
#define GC9XXX_SET_MEM_ACS_CTL 0x36
#define GC9XXX_CMD_INVERT_ON 0x21
#define GC9XXX_CMD_DISPLAY_ON 0x29
static bool is_st7735;static unsigned tick,n,screen_phase,power_on_at;
#define PAL_MODE_OUTPUT_PUSHPULL 0
#define PAL_RP_PAD_DRIVE12 0
void palSetLineMode(unsigned pin,unsigned mode){assert(pin==17);(void)mode;}
void palSetLine(unsigned pin){assert(pin==17);}
void palClearLine(unsigned pin){assert(pin==17);power_on_at=tick;}
static struct {unsigned op,value,at;} events[64];
void wait_ms(unsigned ms){tick+=ms;}
void qp_comms_command(painter_device_t d,uint8_t op){(void)d;events[n++]=(typeof(events[0])){op,0,tick};}
void qp_comms_command_databyte(painter_device_t d,uint8_t op,uint8_t v){qp_comms_command(d,op);events[n-1].value=v;}
void qp_comms_bulk_command_sequence(painter_device_t d,const uint8_t *p,size_t len){
 for(size_t i=0;i<len;){assert(i+3<=len);unsigned count=p[i+2];assert(i+3+count<=len);qp_comms_command(d,p[i]);events[n-1].value=count?p[i+3]:0;wait_ms(p[i+1]);i+=3+count;}
}
'''+(board/'display_st7735_init.h').read_text()+'\n'+s[a:b]+power_prefix+'''
int main(void){
 // Lifecycle completed the off interval. Only the preserved powered wait remains.
 display_init();assert(power_on_at==0&&tick==600&&screen_phase==1);
 const unsigned expected[]={0xc8,0xa8,0x08,0x68};
 for(unsigned r=0;r<4;r++){
  n=tick=0;assert(qp_gc9107_init(0,r));assert(events[0].op==0x11&&events[0].at>=120);
  unsigned directions=0,on=0,dir_index=0,on_index=0;
  for(unsigned i=0;i<n;i++){
   assert(events[i].op!=0x2c);
   if(events[i].op==0x36){directions++;dir_index=i;assert(events[i].value==expected[r]);}
   if(events[i].op==0x29){on++;on_index=i;}
   if(i>0)assert(events[i].at-events[0].at>=120);
  }
  assert(directions==1&&on==1&&dir_index<on_index);assert(tick-events[on_index].at>=20);
 }
 puts("PASS actual panel init: single orientation before display-on, all four rotations, reset and sleep-out waits");
}
'''
with tempfile.TemporaryDirectory() as td:
 c=Path(td)/'test.c';out=Path(td)/'test';c.write_text(harness)
 subprocess.run(['cc','-std=gnu11','-Wall','-Wextra','-Werror','-fsanitize=undefined',str(c),'-o',str(out)],check=True)
 subprocess.run([str(out)],check=True)
