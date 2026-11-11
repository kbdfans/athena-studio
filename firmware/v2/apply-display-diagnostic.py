"""Athena75-only diagnostic A/B init; leave1800 paused and unchanged.
Profile0 is exact original75 compatibility commands; profile1 is display-r3 ST7735.
Mode selection is RAM-only and defaults to0 after reboot. No resource/EEPROM writes.
"""
from pathlib import Path
import subprocess,sys
root=Path(sys.argv[1]);board=root/'keyboards/ydkb/athena75';pin='be6d662bf0412c784f586e68e919547e715fbdba'
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()==pin
p=board/'c1_display.c';s=p.read_text();assert '// LCD diagnostic A/B' not in s
old=subprocess.check_output(['git','-C',str(root),'show',f'{pin}:keyboards/ydkb/athena75/c1_display.c'],text=True)
a=old.index('bool qp_gc9107_init(');b=old.index('void display_power_toggle',a)
original=old[a:b];original=original.replace('bool qp_gc9107_init(', 'static bool lcd_init_original(')
a=s.index('bool qp_gc9107_init(');b=s.index('void display_power_toggle',a)
standard=s[a:b].replace('bool qp_gc9107_init(', 'static bool lcd_init_module(')
s=s[:a]+'''// LCD diagnostic A/B: runtime changes never touch Flash.
static volatile uint8_t lcd_requested_profile;
static volatile uint8_t lcd_active_profile=255;
static volatile uint32_t lcd_init_attempts,lcd_init_elapsed;
'''+original+standard+'''bool qp_gc9107_init(painter_device_t device, painter_rotation_t rotation) {
    const uint8_t profile=lcd_requested_profile;
    uint32_t start=timer_read32();lcd_init_attempts++;
    bool result=profile==0?lcd_init_original(device,rotation):lcd_init_module(device,rotation);
    lcd_active_profile=profile;lcd_init_elapsed=timer_elapsed32(start);
    return result;
}

'''+s[b:]
s+='''
//24 reads diagnostic state;25 selects RAM-only init profile and requests recovery.
void display_diagnostic_receive(uint8_t p[32]) {
    uint8_t op=p[2];uint32_t profile;memcpy(&profile,p+6,4);memset(p+5,0,27);
    extern volatile bool screen_upload_paused,screen_recover_pending;
    if(op==25){
        if(profile>1){p[5]=3;return;}
        if(screen_upload_paused||screen_recover_pending||(dl_flags()&32)){p[5]=2;return;}
        lcd_requested_profile=profile;__dmb();screen_recover_pending=true;
    }
    memcpy(p+6,"LCD1",4);p[10]=lcd_active_profile;p[11]=lcd_requested_profile;
    uint32_t attempts=lcd_init_attempts,elapsed=lcd_init_elapsed,uptime=timer_read32();
    memcpy(p+12,&attempts,4);memcpy(p+16,&elapsed,4);memcpy(p+20,&uptime,4);
    p[24]=dl_flags();p[25]=palReadLine(17U)?1:0;
}
'''
s=s.replace('#include "timer.h"','#include "timer.h"\n#include "hardware/sync.h"');p.write_text(s)
p=board/'user_rawhid.c';s=p.read_text().replace('#include "screen_upload.h"','#include "screen_upload.h"\nvoid display_diagnostic_receive(uint8_t p[32]);')
needle='    if (length == 32 && data[0] == 0xFD && data[1] == 0xA8)'
assert s.count(needle)==1
s=s.replace(needle,'    if (length == 32 && data[0] == 0xFD && data[1] == 0xA8 && (data[2]==24 || data[2]==25)) { display_diagnostic_receive(data); return; }\n'+needle);p.write_text(s)
p=board/'pet.c';s=p.read_text();assert 'p[30]=12;' in s;p.write_text(s.replace('p[30]=12;','p[30]=13;'))
print('Applied75-only original/module diagnostic profiles; no1800 source edits')
