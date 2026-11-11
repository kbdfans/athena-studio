"""Apply v2 after the reviewed v1 patch, to the same pinned clean upstream."""
from pathlib import Path
import subprocess,sys,shutil
root=Path(sys.argv[1]).resolve();here=Path(__file__).resolve().parent;board=root/'keyboards/ydkb/athena75'
subprocess.run([sys.executable,str(here.parent/'apply-source.py'),str(root)],check=True)
for path in (here/'src').iterdir():shutil.copy2(path,board/path.name)
def edit(name,old,new):
 p=board/name;s=p.read_text();assert s.count(old)==1,(name,old);p.write_text(s.replace(old,new))
edit('rules.mk','screen_upload_platform.c','screen_upload_platform.c pet.c pet_render.c')
edit('config.h','Athena75 Screen Studio v1','Athena75 Screen Studio v2 Pet')
edit('config.h','#define LCD_SPI_DIVISOR 4','#define LCD_SPI_DIVISOR 16')
edit('athena75.c','#include "screen_upload.h"','#include "screen_upload.h"\n#include "pet.h"')
edit('athena75.c','    protocol_post_init();','    protocol_post_init();\n    pet_init();')
edit('athena75.c','        su_task();','        su_task();\n        pet_tick();')
edit('user_rawhid.c','data[1] == 0xA7','data[1] == 0xA8')
edit('user_rawhid.c','    uint8_t *command_id = &(data[0]);','    if (length == 32 && data[0] == 0xFD && (data[1] == 0xA7 || data[1] == 0xF1)) { memset(data+5,0,27); data[5]=SU_COMMAND; return; }\n    uint8_t *command_id = &(data[0]);')
edit('user_function.c','#include "hardware/watchdog.h"','#include "hardware/watchdog.h"\n#include "pet.h"')
edit('user_function.c','    //static uint8_t mod_keys_registered;','    if (record->event.pressed && keycode > KC_NO && keycode < KC_LCTL) pet_key(keycode == KC_SPC);\n    //static uint8_t mod_keys_registered;')
edit('user_function.c','        case KC_O:', '''        case KC_P: {
            pet_status_t s;pet_status(&s);uint8_t r[32]={0};pet_command(17,!s.mode,r);return true;
        }
        case KC_F: {uint8_t r[32]={0};pet_command(18,0,r);return true;}
        case KC_H: {uint8_t r[32]={0};pet_command(19,0,r);return true;}
        case KC_S: {uint8_t r[32]={0};pet_command(21,0,r);return true;}
        case KC_O:''')
p=board/'c1_display.c';s=p.read_text().replace('#include "timer.h"','#include "timer.h"\n#include "pet.h"')
a=s.index('void next_gif_id(void) {');b=s.index('//user config end',a)
s=s[:a]+'''void next_gif_id(void) {
    pet_status_t s;pet_status(&s);uint8_t r[32]={0};pet_command(20,(s.image+1)%3,r);
}

'''+s[b:]
a=s.index('extern volatile uint8_t screen_phase;',s.index('bool lcd_is_on(void)'))
s=s[:a]+'''
static uint8_t rendered_mode=255, rendered_image=255;
static painter_image_handle_t load_slot_image(uint8_t slot) {
    static const uint32_t addresses[]={0x10400000,0x10600000,0x10800000};
    if(slot>=3)return NULL;
    const uint8_t *p=(const uint8_t *)addresses[slot];
    const uint8_t magic[]={0,255,18,0,0,81,71,70,1};
    uint32_t bytes,inverse;uint16_t width,height,frames;
    memcpy(&bytes,p+9,4);memcpy(&inverse,p+13,4);memcpy(&width,p+17,2);memcpy(&height,p+19,2);memcpy(&frames,p+21,2);
    if(memcmp(p,magic,9)||inverse!=~bytes||width!=128||height!=128||!frames||frames>63||bytes!=28u+frames*32788u||bytes>0x200000)return NULL;
    return qp_load_image_mem(p);
}
void display_reload_after_upload(void) {
    qp_stop_animation(my_anim);qp_close_image(playing_gif);playing_gif=NULL;
    rendered_mode=rendered_image=255;boot_displaying=0;gif_started=0;
}
void display_recover(void) {
    display_reload_after_upload();user_eeconfig.lcd_off=0;now_lcd_off=0;display_init();
    display_reload_after_upload();
}
void display_task_user(void) {
    if(now_lcd_off)return;
    pet_status_t status;pet_status(&status);if(!status.ready)return;
    bool changed=rendered_mode!=status.mode||rendered_image!=status.image;
    if(changed){
        display_reload_after_upload();qp_rect(display,0,0,127,127,0,0,0,true);
        rendered_mode=status.mode;rendered_image=status.image;
        if(!status.mode){
            playing_gif=load_slot_image(status.image);
            if(playing_gif)my_anim=qp_animate(display,0,0,playing_gif);
            else qp_drawtext(display,4,48,my_font,"No image");
        }
    }
    if(status.mode)pet_render(display,changed);
    screen_phase=status.mode?7:playing_gif?5:6;
}
void suspend_power_down_user_display(void) {
    qp_stop_animation(my_anim);palSetLine(17U);now_lcd_off=1;
}
void suspend_wakeup_init_user_display(void) {
    if(!user_eeconfig.lcd_off){palClearLine(17U);now_lcd_off=0;rendered_mode=255;}
}
'''
# Make screen toggle resume redraw; preserve the user's original on/off setting.
s=s.replace('        palClearLine(17U); //power on','        palClearLine(17U); //power on\n        display_reload_after_upload();')
s=s.replace('bool is_st7735 = false;','void display_reload_after_upload(void);\nbool is_st7735 = false;')
s=s.replace('static uint8_t now_gif_id = 1;\n','')
s=s.replace('    display = qp_gc9107_make_spi_device(', '    if (!display) display = qp_gc9107_make_spi_device(')
s=s.replace('    qp_init(display, LCD_ROTATION);', '    if (!display || !qp_init(display, LCD_ROTATION)) { screen_phase=250; return; }')
s=s.replace('qp_rect(display, 0, 0, LCD_HEIGHT, LCD_WIDTH, 0, 0, 0, 1)', 'qp_rect(display, 0, 0, LCD_WIDTH-1, LCD_HEIGHT-1, 0, 0, 0, 1)')
s=s.replace('    my_font = qp_load_font_mem(font_robotomono20);','    if (!my_font) my_font = qp_load_font_mem(font_robotomono20);')
p.write_text(s)
subprocess.run([sys.executable,str(here/'apply-typing.py'),str(root)],check=True)
print('Applied v2: three image slots, 2-bit pet, isolated save journal, A8 capability')
