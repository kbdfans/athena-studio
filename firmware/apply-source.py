"""Apply the reviewed Athena75 extension to a clean, pinned upstream checkout."""
from pathlib import Path
import shutil,sys,subprocess

root=Path(sys.argv[1]).resolve()
expected='be6d662bf0412c784f586e68e919547e715fbdba'
actual=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
if actual!=expected:raise SystemExit(f'Expected upstream {expected}, got {actual}')
board=root/'keyboards/ydkb/athena75'
here=Path(__file__).resolve().parent
def change(name,old,new):
    path=board/name
    text=path.read_text()
    if text.count(old)!=1:raise SystemExit(f'Unexpected source in {name}; use the pinned clean checkout')
    path.write_text(text.replace(old,new))

for name in ('screen_upload.h','screen_upload.c','screen_upload_platform.c'):
    shutil.copy2(here/'src'/name,board/name)
change('rules.mk','SRC ?=\tc1_display.c c1_main.c matrix.c user_led.c user_function.c user_rawhid.c',
       'SRC ?=\tc1_display.c c1_main.c matrix.c user_led.c user_function.c user_rawhid.c screen_upload.c screen_upload_platform.c')
change('user_rawhid.c','#include "via.h"','#include "via.h"\n#include "screen_upload.h"')
change('user_rawhid.c','    uint8_t *command_id = &(data[0]);',
       '    if (length == 32 && data[0] == 0xFD && data[1] == 0xA7) { su_receive(data); if (data[2] == SU_INFO && data[5] == SU_OK) su_diagnostics(data); return; }\n    uint8_t *command_id = &(data[0]);')
change('athena75.c','#include "c1.h"','#include "c1.h"\n#include "screen_upload.h"')
change('athena75.c','        housekeeping_task();','        su_task();\n        housekeeping_task();')
change('config.h','#define PRODUCT         "Athena75 Keybaord (VIAL_DQ5I)"',
       '#define PRODUCT         "Athena75 Screen Studio v1"')
change('c1_main.c','#include "debug.h"','#include "debug.h"\n#include "timer.h"\n#include "hardware/sync.h"\n\nvolatile bool screen_upload_paused;\nvolatile bool screen_reload_pending;\nvolatile bool screen_recover_pending;\nvolatile uint8_t screen_phase;\nvolatile uint16_t screen_heartbeat;\nvoid display_recover(void);\nvoid display_reload_after_upload(void);')
change('c1_main.c','// Main process for core1','''// Only the upload path uses bounded handshakes. No Flash operation starts on timeout.
bool c1_upload_flash_begin(void) {
    c1_restart_flag = false;
    c1_stop_flag = true;
    __dmb();
    uint32_t start = timer_read32();
    while (c1_stop_flag) {
        if (timer_elapsed32(start) > 2500) {
            c1_stop_flag = false;
            c1_restart_flag = true;
            __dmb();
            return false;
        }
    }
    __dmb();
    return true;
}
void c1_upload_flash_end(void) {
    __dmb();
    c1_restart_flag = true;
    uint32_t start = timer_read32();
    while (c1_restart_flag && timer_elapsed32(start) <= 2500) {}
}

// Main process for core1''')
change('c1_main.c','void c1_main_task(void)\n{','''void c1_main_task(void)
{
    screen_heartbeat++;
    if (screen_upload_paused) return;
    if (screen_recover_pending) { screen_recover_pending = false; display_recover(); }
    if (screen_reload_pending) {
        screen_reload_pending = false;
        display_reload_after_upload();
    }''')
change('c1_display.c','#include "timer.h"','#include "timer.h"\n#include <string.h>')
# Bounds-check the public resource header before passing it to the generic QGF loader.
change('c1_display.c','void update_gif_task(void) {','''extern volatile uint8_t screen_phase;

static painter_image_handle_t load_slot_image(uint8_t slot) {
    static const uint32_t addresses[] = {0x10400000,0x10500000,0x10600000,0x10800000,0x10a00000,0x10c00000};
    if (slot > 5) return NULL;
    const uint8_t *p = (const uint8_t *)addresses[slot];
    const uint8_t magic[] = {0,255,18,0,0,81,71,70,1};
    uint32_t bytes, inverse;
    memcpy(&bytes, p+9, 4); memcpy(&inverse, p+13, 4);
    uint16_t width, height, frames;
    memcpy(&width,p+17,2); memcpy(&height,p+19,2); memcpy(&frames,p+21,2);
    if (memcmp(p,magic,9) || inverse != ~bytes || bytes < 28 ||
        bytes > (slot < 2 ? 0x100000u : 0x200000u) || width != 128 || height != 128 ||
        !frames || frames > (slot < 2 ? 31 : 63)) return NULL;
    return qp_load_image_mem(p);
}

void display_recover(void) {
    qp_stop_animation(my_anim);
    qp_close_image(playing_gif);
    user_eeconfig.lcd_off = 0;
    now_lcd_off = 0;
    boot_displaying = 1;
    display_init();
    prev_gif_id = 99;
}

void display_reload_after_upload(void) {
    qp_stop_animation(my_anim);
    qp_close_image(playing_gif);
    playing_gif = NULL;
    gif_started = 0;
    prev_gif_id = 99;
    boot_displaying = 0;
    now_gif_id = user_eeconfig.gif_id;
    if (now_gif_id < 1 || now_gif_id > 5) now_gif_id = 1;
}

void update_gif_task(void) {''')
path=board/'c1_display.c';text=path.read_text()
assert text.count('qp_load_image_mem(gif_addr[now_gif_id])')==2
text=text.replace('qp_load_image_mem(gif_addr[now_gif_id])','load_slot_image(now_gif_id)')
text=text.replace('if (playing_gif->width == 128 && playing_gif->width == 128)',
                  'if (playing_gif && playing_gif->width == 128 && playing_gif->height == 128)')
text=text.replace('    static painter_image_handle_t logo_image;\n','')
text=text.replace('    static const uint32_t gif_addr[6] = { (0x1040<<16), (0x1050<<16), (0x1060<<16), (0x1080<<16), (0x10A0<<16), (0x10C0<<16)};\n','')
text=text.replace('    update_gif_task();\n','    update_gif_task();\n    if (!playing_gif) return;\n')
text=text.replace('if (animation_states[0].frame_number != prev_frame)',
                  'if (animation_states[0].image && animation_states[0].frame_number != prev_frame)')
path.write_text(text)
print('Applied runtime upload and invalid-image guards to',board)

# Diagnostic markers do not change the panel command sequence.
path=board/'c1_display.c'; text=path.read_text()
text=text.replace('#include <string.h>', '#include <string.h>\nextern volatile uint8_t screen_phase;')
text=text.replace('void display_init(void)\n{', 'void display_init(void)\n{\n    screen_phase = 1;')
text=text.replace('    // Display Init', '    screen_phase = 2;\n    // Display Init')
text=text.replace('    // boot gif', '    screen_phase = 3;\n    // boot gif')
text=text.replace('    kb_idle_timer = 0;\n    gif_started = 0;', '    screen_phase = 4;\n    kb_idle_timer = 0;\n    gif_started = 0;')
text=text.replace('    if (!playing_gif) return;', '    screen_phase = playing_gif ? 5 : 6;\n    if (!playing_gif) return;')
path.write_text(text)
change('athena75.c', '    c1_before_flash_operation();\n    return true;', '    return c1_upload_flash_begin();')
change('athena75.c', '    c1_after_flash_operation();\n    return true;', '    c1_upload_flash_end();\n    return true;')
with (board/'c1.h').open('a') as f:
    f.write('\nbool c1_upload_flash_begin(void);\nvoid c1_upload_flash_end(void);\n')
# Park the other core with interrupts masked BEFORE acknowledging XIP can stop.
change('c1_main.c', '''    if (c1_stop_flag) {
        c1_stop_flag = false;
        while (!c1_restart_flag) {
            continue;
        }
        c1_restart_flag = false;
    }''', '''    if (c1_stop_flag) {
        uint32_t interrupts = save_and_disable_interrupts();
        __dmb();
        c1_stop_flag = false;
        while (!c1_restart_flag) {
            continue;
        }
        __dmb();
        c1_restart_flag = false;
        restore_interrupts(interrupts);
    }''')
# Physical Flash is 16 MiB; keep existing EEPROM at its original 2 MiB-era offset.
with (board/'rules.mk').open('a') as f:
    f.write('\nOPT_DEFS += -DPICO_FLASH_SIZE_BYTES=16777216 -DWEAR_LEVELING_RP2040_FLASH_BASE=0x1F0000\n')
