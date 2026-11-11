"""Add typing mode to the existing reviewed fast/care checkout (idempotent)."""
from pathlib import Path
import shutil,sys
here=Path(__file__).resolve().parent;board=Path(sys.argv[1])/'keyboards/ydkb/athena75'
for name in ['screen_upload.c','pet.c','pet.h','typing.c','typing.h','typing_render.c','typing_font.h','screen_keys.c','screen_keys.h']:shutil.copy2(here/'src'/name,board/name)
def replace(name,old,new):
 p=board/name;s=p.read_text()
 if new in s:return
 assert s.count(old)==1,(name,old);p.write_text(s.replace(old,new))
replace('rules.mk','pet.c pet_render.c','pet.c pet_render.c typing.c typing_render.c')
replace('c1_display.c','#include "pet.h"','#include "pet.h"\n#include "typing.h"')
replace('c1_display.c','    if(status.mode)pet_render(display,changed);\n    screen_phase=status.mode?7:playing_gif?5:6;','    if(status.mode==1)pet_render(display,changed);\n    else if(status.mode==2)typing_render(display,changed);\n    screen_phase=status.mode==2?8:status.mode==1?7:playing_gif?5:6;')
replace('user_function.c','#include "pet.h"','#include "pet.h"\n#include "typing.h"')
replace('user_function.c','    if (record->event.pressed && keycode > KC_NO && keycode < KC_LCTL) pet_key(keycode == KC_SPC);','    if (record->event.pressed) {\n        pet_status_t s;pet_status(&s);\n        uint8_t mods=get_mods()|get_weak_mods()|get_oneshot_mods();\n        if(s.mode==2 && (mods&0x22)!=0x22)typing_key(keycode,mods,timer_read32());\n        else if(keycode>KC_NO && keycode<KC_LCTL)pet_key(keycode==KC_SPC);\n    }')
replace('user_function.c','pet_command(17,!s.mode,r)','pet_command(17,s.mode==1?0:1,r)')
replace('user_function.c','        case KC_F: {','        case KC_T: {pet_status_t s;pet_status(&s);uint8_t r[32]={0};pet_command(17,s.mode==2?0:2,r);return true;}\n        case KC_F: {')
print('Typing mode integrated')

replace('rules.mk','pet.c pet_render.c typing.c typing_render.c','pet.c pet_render.c typing.c typing_render.c screen_keys.c')
replace('user_function.c','#include "typing.h"','#include "typing.h"\n#include "screen_keys.h"')
replace('user_function.c','bool process_record_user(uint16_t keycode, keyrecord_t *record) {','bool process_record_user(uint16_t keycode, keyrecord_t *record) {\n    if(screen_mode_key(keycode,record->event.pressed))return false;')

import subprocess
subprocess.run([sys.executable,str(here/'apply-display.py'),str(Path(sys.argv[1]))],check=True)
