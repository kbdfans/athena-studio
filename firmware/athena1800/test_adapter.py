"""Exercise actual1800 panel commands and EEPROM packing; verify board isolation."""
from pathlib import Path
import subprocess,sys,tempfile
root=Path(sys.argv[1]);board=root/'keyboards/ydkb/athena1800';pin='be6d662bf0412c784f586e68e919547e715fbdba'
for name in ['matrix.c','keyboard.json','keymaps/vial/keymap.c','keymaps/vial/vial.json','keymaps/vial/config.h','user_led.c','switch_board.h']:
 original=subprocess.check_output(['git','-C',str(root),'show',f'{pin}:keyboards/ydkb/athena1800/{name}'])
 assert (board/name).read_bytes()==original,name
s=(board/'c1_display.c').read_text();a=s.index('bool qp_gc9107_init(');b=s.index('void display_is_st7735_toggle',a)
init=s[a:b]
original=subprocess.check_output(['git','-C',str(root),'show',f'{pin}:keyboards/ydkb/athena1800/c1_display.c'],text=True)
oa=original.index('bool qp_gc9107_init(');ob=original.index('void display_is_st7735_toggle',oa);assert init==original[oa:ob],'Preserve exact original1800 panel commands'
# The inherited unused table has no behavior; suppress only that diagnostic.
harness='''#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <assert.h>
#include <stdio.h>
#include "c1.h"
#include "qp_gc9xxx_opcodes.h"
#include "qp_gc9107_opcodes.h"
#include "display_st7735_init.h"
typedef void *painter_device_t;typedef unsigned painter_rotation_t;
enum {QP_ROTATION_0,QP_ROTATION_90,QP_ROTATION_180,QP_ROTATION_270};
static bool is_st7735;static unsigned tick,n;
static struct {unsigned op,value,at;} events[64];
void wait_ms(unsigned ms){tick+=ms;}
void qp_comms_command(painter_device_t d,uint8_t op){(void)d;events[n++]=(typeof(events[0])){op,0,tick};}
void qp_comms_command_databyte(painter_device_t d,uint8_t op,uint8_t v){qp_comms_command(d,op);events[n-1].value=v;}
void qp_comms_bulk_command_sequence(painter_device_t d,const uint8_t *p,size_t len){
 for(size_t i=0;i<len;){assert(i+3<=len);unsigned count=p[i+2];assert(i+3+count<=len);qp_comms_command(d,p[i]);events[n-1].value=count?p[i+3]:0;wait_ms(p[i+1]);i+=3+count;}
}
'''+init+'''
int main(void){
 user_eeconfig_t config={.raw=0x31};assert(config.gif_id==1&&config.lcd_off&&config.is_st7735);
 config.lcd_off=0;assert(config.raw==0x21);config.gif_id=5;assert(config.raw==0x25);
 const unsigned gc_expected[]={0x08,0x68,0xc8,0xa8};
 for(unsigned type=0;type<2;type++)for(unsigned rotation=0;rotation<4;rotation++){
  n=tick=0;is_st7735=type;assert(qp_gc9107_init(0,rotation));
  unsigned directions=0,on=0,dir_i=0,on_i=0;
  for(unsigned i=0;i<n;i++){
   if(events[i].op==0x36){directions++;dir_i=i;assert(events[i].value==(type?0x08:gc_expected[rotation]));}
   if(events[i].op==0x29){on++;on_i=i;}
  }
  assert(directions==1&&on==1);
  assert(events[on_i].at>=130);(void)dir_i;
 }
 puts("PASS1800: matrix/identity/keymap unchanged, original EEPROM packing, ST7735 physical0x08 and legacyGC rotations");
}
'''
with tempfile.TemporaryDirectory() as td:
 c=Path(td)/'test.c';out=Path(td)/'test';c.write_text(harness)
 subprocess.run(['cc','-std=gnu11','-Wall','-Wextra','-Werror','-Wno-unused-variable','-fsanitize=undefined','-I',str(board),'-I',str(root/'drivers/painter/gc9xxx'),str(c),'-o',str(out)],check=True)
 subprocess.run([str(out)],check=True)
