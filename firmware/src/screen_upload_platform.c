// SPDX-License-Identifier: GPL-2.0-or-later
#include "screen_upload.h"
#include "quantum.h"
#include "hardware/flash.h"
#include "hardware/sync.h"
#include "c1.h"

extern bool c1_upload_flash_begin(void);
extern void c1_upload_flash_end(void);
extern volatile bool screen_upload_paused;
extern volatile bool screen_reload_pending;
extern volatile bool screen_recover_pending;
extern volatile uint8_t screen_phase;
extern volatile uint16_t screen_heartbeat;
extern user_eeconfig_t user_eeconfig;

const uint8_t *su_flash_ptr(uint32_t offset){return (const uint8_t *)(0x10000000u+offset);}
uint32_t su_millis(void){return timer_read32();}
void su_display_recover(void){screen_recover_pending=true;__dmb();}
void su_diagnostics(uint8_t p[32]){
    uint16_t beat=screen_heartbeat;
    p[26]=screen_phase;p[27]=user_eeconfig.raw&31;p[28]=beat&255;p[29]=beat>>8;
    p[30]=screen_upload_paused;p[31]=screen_recover_pending;
}
void su_display_pause(bool paused){
    if(!paused)screen_reload_pending=true;
    __dmb();screen_upload_paused=paused;__dmb();
}
bool su_flash_erase(uint32_t offset){
    if(offset<0x400000||offset>0xdff000||offset%4096)return false;
    if(!c1_upload_flash_begin())return false;
    uint32_t interrupts=save_and_disable_interrupts();
    flash_range_erase(offset,4096);
    restore_interrupts(interrupts);c1_upload_flash_end();return true;
}
bool su_flash_program(uint32_t offset,const uint8_t page[256]){
    if(offset<0x400000||offset>0xdfff00||offset%256)return false;
    if(!c1_upload_flash_begin())return false;
    uint32_t interrupts=save_and_disable_interrupts();
    flash_range_program(offset,page,256);
    restore_interrupts(interrupts);c1_upload_flash_end();return true;
}
