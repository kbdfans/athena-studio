"""Display-core ownership and ST7735 module startup, after apply-typing.py."""
from pathlib import Path
import sys,shutil
board=Path(sys.argv[1])/'keyboards/ydkb/athena75';here=Path(__file__).resolve().parent
for name in ('display_lifecycle.c','display_lifecycle.h','display_st7735_init.h'):shutil.copy2(here/'src'/name,board/name)
p=board/'rules.mk';s=p.read_text()
if 'display_lifecycle.c' not in s:s=s.replace('screen_keys.c','screen_keys.c display_lifecycle.c')
p.write_text(s)
p=board/'c1_display.c';s=p.read_text()
if '// ST7735 lifecycle revision 1' not in s:
 s=s.replace('#include "typing.h"','#include "typing.h"\n#include "display_lifecycle.h"\n#include "display_st7735_init.h"\n// ST7735 lifecycle revision 1')
 a=s.index('bool qp_gc9107_init(');b=s.index('void display_power_toggle',a)
 s=s[:a]+'''bool qp_gc9107_init(painter_device_t device, painter_rotation_t rotation) {
    // Generic QP reset holds low20ms/high20ms; module requires120ms after reset.
    wait_ms(120);
    qp_comms_bulk_command_sequence(device, athena_st7735_init_sequence, sizeof(athena_st7735_init_sequence));
    const uint8_t madctl[]={0xc8,0xa8,0x08,0x68};
    is_st7735=true;
    // Physical module is mounted 180 degrees from the r1 default.
    qp_comms_command_databyte(device, GC9XXX_SET_MEM_ACS_CTL, madctl[rotation]);
    qp_comms_command(device, GC9XXX_CMD_INVERT_ON);
    qp_comms_command(device, GC9XXX_CMD_DISPLAY_ON);
    wait_ms(20);
    return true;
}

'''+s[b:]
 a=s.index('void display_power_toggle');b=s.index('void next_gif_id',a)
 s=s[:a]+'''void display_power_toggle(void) {
    user_eeconfig.lcd_off ^= 1;
    dl_set_off(user_eeconfig.lcd_off);
    eeconfig_update_user(user_eeconfig.raw);
}

'''+s[b:]
 a=s.index('void display_recover(void) {');b=s.index('void display_task_user',a)
 s=s[:a]+'''bool dl_hw_init(void) {
    display_reload_after_upload();
    display_init();
    const bool ok=screen_phase!=250;
    display_reload_after_upload();
    now_lcd_off=!ok;
    return ok;
}
void dl_hw_off(void) {
    display_reload_after_upload();
    palSetLineMode(17U, PAL_MODE_OUTPUT_PUSHPULL | PAL_RP_PAD_DRIVE12);
    palSetLine(17U);now_lcd_off=1;
}
uint32_t dl_now(void){return timer_read32();}
void display_recover(void) {
    user_eeconfig.lcd_off=0;dl_set_off(false);dl_request_reinit();
}
bool display_lifecycle_task(void) {
    static bool config_loaded;
    pet_status_t status;pet_status(&status);
    if(!status.ready)return false;
    if(!config_loaded){dl_set_off(user_eeconfig.lcd_off);config_loaded=true;}
    if(dl_task())return true;
    const uint8_t flags=dl_flags();
    screen_phase=(flags&1)?240:(flags&2)?241:250;
    return false;
}
'''+s[b:]
 a=s.index('void suspend_power_down_user_display(void) {')
 s=s[:a]+'''void suspend_power_down_user_display(void) {
    dl_set_suspended(true);
}
void suspend_wakeup_init_user_display(void) {
    dl_set_suspended(false);
}
'''
 p.write_text(s)
# Incremental display-r2 adjustment, also runs after a fresh application.
p=board/'c1_display.c';s=p.read_text()
s=s.replace('const uint8_t madctl[]={0x08,0x68,0xc8,0xa8};','const uint8_t madctl[]={0xc8,0xa8,0x08,0x68};')
s=s.replace('// Keep the already accepted orientation and inversion of this enclosure.','// Physical module is mounted 180 degrees from the r1 default.')
s=s.replace('    wait_ms(200);\n\n    screen_phase = 2;', '    wait_ms(600); // allow the panel supply to settle before reset\n\n    screen_phase = 2;')
if '    qp_comms_command(device, GC9XXX_CMD_DISPLAY_ON);' not in s:
 s=s.replace('    qp_comms_command(device, GC9XXX_CMD_INVERT_ON);','    qp_comms_command(device, GC9XXX_CMD_INVERT_ON);\n    qp_comms_command(device, GC9XXX_CMD_DISPLAY_ON);\n    wait_ms(20);')
s=s.replace('    screen_phase=(flags&1)?240:(flags&2)?241:250;','    screen_phase=(flags&1)?240:(flags&2)?241:(flags&32)&&!(flags&16)?239:250;')
s=s.replace('static uint8_t prev_gif_id = 99;\n','')
# display-r3: lifecycle now owns a full 1s off interval, including USB settling.
# Preserve the 600ms powered settling and all reset/sleep-out waits.
s=s.replace('    wait_ms(1000);\n    palClearLine(17U);', '    // Power-off interval already completed by display_lifecycle_task.\n    palClearLine(17U);')
p.write_text(s)
p=board/'c1_main.c';s=p.read_text()
if 'bool display_lifecycle_task(void);' not in s:
 s=s.replace('void display_recover(void);','void display_recover(void);\nbool display_lifecycle_task(void);')
 s=s.replace('    if (screen_reload_pending) {','    if (!display_lifecycle_task()) return;\n    if (screen_reload_pending) {')
 s=s.replace('    display_init();\n    // Start main task','    // Startup waits for configuration/pet readiness in the display task.\n    // Start main task')
 p.write_text(s)
p=board/'screen_upload_platform.c';s=p.read_text()
if '#include "display_lifecycle.h"' not in s:
 s=s.replace('#include "c1.h"','#include "c1.h"\n#include "display_lifecycle.h"')
 s=s.replace('p[31]=screen_recover_pending;','p[31]=(screen_recover_pending?1:0)|(dl_flags()<<1)|(palReadLine(17U)?0x80:0);')
 p.write_text(s)
print('Applied ST7735 initialization and display-core lifecycle ownership')
