"""Trace compiled75 A/B functions and RAM-only command routing without hardware."""
from pathlib import Path
import sys,tempfile,subprocess
root=Path(sys.argv[1]);board=root/'keyboards/ydkb/athena75';s=(board/'c1_display.c').read_text();a=s.index('// LCD diagnostic A/B');b=s.index('void display_power_toggle',a)
functions=s[a:b]+s[s.index('//24 reads diagnostic'):]
harness='''#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <assert.h>
#include <stdio.h>
#include "qp_gc9xxx_opcodes.h"
#include "qp_gc9107_opcodes.h"
#include "display_st7735_init.h"
typedef void *painter_device_t;typedef unsigned painter_rotation_t;
enum {QP_ROTATION_0,QP_ROTATION_90,QP_ROTATION_180,QP_ROTATION_270};
static bool is_st7735;static unsigned tick,n;static uint8_t flags=4;
volatile bool screen_upload_paused,screen_recover_pending;
#define __dmb() ((void)0)
uint32_t timer_read32(void){return tick;}
uint32_t timer_elapsed32(uint32_t start){return tick-start;}
uint8_t dl_flags(void){return flags;}
bool palReadLine(unsigned pin){assert(pin==17);return false;}
static struct {unsigned op,value,at;} events[64];
void wait_ms(unsigned ms){tick+=ms;}
void qp_comms_command(painter_device_t d,uint8_t op){(void)d;events[n++]=(typeof(events[0])){op,0,tick};}
void qp_comms_command_databyte(painter_device_t d,uint8_t op,uint8_t v){qp_comms_command(d,op);events[n-1].value=v;}
void qp_comms_bulk_command_sequence(painter_device_t d,const uint8_t *p,size_t len){
 for(size_t i=0;i<len;){assert(i+3<=len);unsigned count=p[i+2];assert(i+3+count<=len);qp_comms_command(d,p[i]);events[n-1].value=count?p[i+3]:0;wait_ms(p[i+1]);i+=3+count;}
}
'''+functions+'''
int main(void){
 uint8_t p[32]={0};p[2]=24;display_diagnostic_receive(p);assert(!memcmp(p+6,"LCD1",4)&&p[10]==255&&p[11]==0&&lcd_init_attempts==0);
 for(unsigned profile=0;profile<2;profile++){
  n=tick=0;lcd_requested_profile=profile;assert(qp_gc9107_init(0,QP_ROTATION_180));
  unsigned directions=0,on=0,invert=0;
  for(unsigned i=0;i<n;i++){
   if(events[i].op==0x36){directions++;assert(events[i].value==0x08);}
   if(events[i].op==0x29)on++;if(events[i].op==0x21)invert++;
  }
  assert(directions==1&&on==1&&invert==1&&lcd_active_profile==profile);
 }
 memset(p,0,32);p[2]=25;p[6]=2;display_diagnostic_receive(p);assert(p[5]==3&&!screen_recover_pending);
 p[6]=0;flags=32;display_diagnostic_receive(p);assert(p[5]==2&&!screen_recover_pending);
 p[6]=0;flags=4;screen_upload_paused=true;display_diagnostic_receive(p);assert(p[5]==2&&!screen_recover_pending);
 p[6]=0;screen_upload_paused=false;display_diagnostic_receive(p);assert(!p[5]&&screen_recover_pending&&lcd_requested_profile==0&&lcd_init_attempts==2);
 p[2]=24;display_diagnostic_receive(p);assert(p[10]==1&&p[11]==0); // only requested, not executed on keyboard core
 puts("PASS75 diagnostic: original default, both physical0x08, read-only status, invalid/busy rejection and deferred RAM-only selection");
}
'''
with tempfile.TemporaryDirectory() as td:
 c=Path(td)/'test.c';out=Path(td)/'test';c.write_text(harness)
 subprocess.run(['cc','-std=gnu11','-Wall','-Wextra','-Werror','-Wno-unused-variable','-fsanitize=undefined','-I',str(board),'-I',str(root/'drivers/painter/gc9xxx'),str(c),'-o',str(out)],check=True)
 subprocess.run([str(out)],check=True)
