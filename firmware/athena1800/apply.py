"""Build Athena1800-specific Screen Studio from pinned board and verified shared code.
Never copy Athena75 matrix, USB identity, EEPROM bitfields or default keymap.
"""
from pathlib import Path
import subprocess,sys,shutil,hashlib,json
root=Path(sys.argv[1]).resolve();here=Path(__file__).resolve().parent;v2=here.parent/'v2';board=root/'keyboards/ydkb/athena1800'
pin='be6d662bf0412c784f586e68e919547e715fbdba'
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==pin
manifest=json.loads((v2/'build/display-r3/manifest.json').read_text());snap=v2/'build/display-r3/source'
for n,digest in manifest['source_sha256'].items():assert hashlib.sha256((snap/n).read_bytes()).hexdigest()==digest
names=['config.h','rules.mk','athena1800.c','c1.h','user_function.c','user_rawhid.c','c1_display.c','c1_main.c']
original={n:subprocess.check_output(['git','-C',str(root),'show',f'{pin}:keyboards/ydkb/athena1800/{n}']).decode() for n in names}
assert not (board/'.studio-applied').exists(),'Already applied: use existing checkout or a fresh board'
for n,s in original.items():assert (board/n).read_text()==s,('Unexpected local board changes',n)
for p in (v2/'src').iterdir():shutil.copy2(p,board/p.name)
for n in ('c1_display.c','c1_main.c'):shutil.copy2(snap/n,board/n)

def edit(n,old,new):
 p=board/n;s=p.read_text();assert s.count(old)==1,(n,old);p.write_text(s.replace(old,new))
edit('rules.mk','user_rawhid.c','user_rawhid.c screen_upload.c screen_upload_platform.c pet.c pet_render.c typing.c typing_render.c screen_keys.c display_lifecycle.c')
with (board/'rules.mk').open('a') as f:f.write('\nOPT_DEFS += -DPICO_FLASH_SIZE_BYTES=16777216 -DWEAR_LEVELING_RP2040_FLASH_BASE=0x1F0000\n')
edit('config.h','Athena1800 Keybaord (VIAL_DQ69)','Athena1800 Screen Studio v2')
edit('config.h','#define LCD_SPI_DIVISOR 4','#define LCD_SPI_DIVISOR 16')
with (board/'config.h').open('a') as f:f.write('\n#define ATHENA_FAST_UPLOAD\n')
with (board/'c1.h').open('a') as f:f.write('\nbool c1_upload_flash_begin(void);\nvoid c1_upload_flash_end(void);\n')
edit('athena1800.c','#include "c1.h"','#include "c1.h"\n#include "screen_upload.h"\n#include "pet.h"')
edit('athena1800.c','    protocol_post_init();','    protocol_post_init();\n    pet_init();')
edit('athena1800.c','        housekeeping_task();','        su_task();\n        pet_tick();\n        housekeeping_task();')
edit('athena1800.c','    c1_before_flash_operation();\n    return true;','    return c1_upload_flash_begin();')
edit('athena1800.c','    c1_after_flash_operation();\n    return true;','    c1_upload_flash_end();\n    return true;')
edit('user_rawhid.c','#include "via.h"','#include "via.h"\n#include "screen_upload.h"')
edit('user_rawhid.c','    uint8_t *command_id = &(data[0]);','''    if (length == 32 && data[0] == 0xFD && data[1] == 0xA8) { su_receive(data); if (data[2] == SU_INFO && data[5] == SU_OK) su_diagnostics(data); return; }
    if (length == 32 && data[0] == 0xFD && (data[1] == 0xA7 || data[1] == 0xF1)) { memset(data+5,0,27); data[5]=SU_COMMAND; return; }
    uint8_t *command_id = &(data[0]);''')
edit('user_function.c','#include "hardware/watchdog.h"','#include "hardware/watchdog.h"\n#include "pet.h"\n#include "typing.h"\n#include "screen_keys.h"')
edit('user_function.c','bool process_record_user(uint16_t keycode, keyrecord_t *record) {','''bool process_record_user(uint16_t keycode, keyrecord_t *record) {
    if(screen_mode_key(keycode,record->event.pressed))return false;
    if (record->event.pressed) {
        pet_status_t s;pet_status(&s);
        uint8_t mods=get_mods()|get_weak_mods()|get_oneshot_mods();
        if(s.mode==2 && (mods&0x22)!=0x22)typing_key(keycode,mods,timer_read32());
        else if(keycode>KC_NO && keycode<KC_LCTL)pet_key(keycode==KC_SPC);
    }''')
edit('user_function.c','        case KC_O:', '''        case KC_P: {pet_status_t s;pet_status(&s);uint8_t r[32]={0};pet_command(17,s.mode==1?0:1,r);return true;}
        case KC_T: {pet_status_t s;pet_status(&s);uint8_t r[32]={0};pet_command(17,s.mode==2?0:2,r);return true;}
        case KC_F: {uint8_t r[32]={0};pet_command(18,0,r);return true;}
        case KC_H: {uint8_t r[32]={0};pet_command(19,0,r);return true;}
        case KC_S: {uint8_t r[32]={0};pet_command(21,0,r);return true;}
        case KC_O:''')
# Preserve the 1800's controller selector and physical mounting direction.
p=board/'c1_display.c';s=p.read_text();a=s.index('bool qp_gc9107_init(');b=s.index('void display_power_toggle',a)
o=original['c1_display.c'];oa=o.index('bool qp_gc9107_init(');ob=o.index('void display_is_st7735_toggle',oa)
init=o[oa:ob]
# Keep exact original1800 init;75 cold-start findings make replacing it unjustified.
s=s[:a]+'''void keyboard_pre_init_kb(void) {
    user_eeconfig.raw=eeconfig_read_user();
    is_st7735=user_eeconfig.is_st7735;
}
'''+init+'''void display_is_st7735_toggle(void) {
    user_eeconfig.is_st7735 ^= 1;
    eeconfig_update_user(user_eeconfig.raw);
    // Existing F12/LCD1|2 command reboots after persisting the selection.
}

'''+s[b:];p.write_text(s)
# Normalize diagnostic flags without changing the stored1800 EEPROM bitfields.
p=board/'screen_upload_platform.c';s=p.read_text().replace('#include "c1.h"','#include "c1.h"\n#include "display_lifecycle.h"')
s=s.replace('p[27]=user_eeconfig.raw&31','p[27]=(user_eeconfig.lcd_off?1:0)|(user_eeconfig.gif_id<<1)')
s=s.replace('p[31]=screen_recover_pending;','p[31]=(screen_recover_pending?1:0)|(dl_flags()<<1)|(palReadLine(17U)?0x80:0);');p.write_text(s)
# Shared USB transport patch is guarded by ATHENA_FAST_UPLOAD and already built for75.
for n,marker in [('tmk_core/protocol/usb_descriptor.c','HID_RI_REPORT_COUNT(16, 4096)'),('tmk_core/protocol/chibios/usb_main.c','usbSetupTransfer(usbp, buffer, SU_FEATURE_SIZE, athena_feature_cb)')]:
 assert marker in (root/n).read_text(),'Apply reviewed shared Feature transport first'
(board/'.studio-applied').write_text('athena1800-screen-r1\n')
print('Applied Athena1800 adapter, preserving its matrix, PID, EEPROM and controller selection')
