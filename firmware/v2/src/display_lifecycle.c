// SPDX-License-Identifier: GPL-2.0-or-later
#include "display_lifecycle.h"
static volatile bool suspended, user_off, reset_requested;
static volatile bool powered, retry_pending, settling;
static bool power_known;
static uint8_t attempts;
static uint32_t failed_at, settle_started;
void dl_set_suspended(bool value){suspended=value;__sync_synchronize();}
void dl_set_off(bool value){user_off=value;__sync_synchronize();}
void dl_request_reinit(void){reset_requested=true;__sync_synchronize();}
uint8_t dl_flags(void){return (suspended?1:0)|(user_off?2:0)|(powered?4:0)|(reset_requested?8:0)|(retry_pending?16:0)|(settling?32:0);}
bool dl_task(void){
    __sync_synchronize();
    if(suspended||user_off){
        if(!power_known||powered){dl_hw_off();powered=false;power_known=true;}
        settling=false;retry_pending=false;attempts=0;
        return false;
    }
    if(powered&&!reset_requested)return true;
    if(reset_requested){
        reset_requested=false;__sync_synchronize();
        attempts=0;retry_pending=false;settling=false;
        if(powered){dl_hw_off();powered=false;}
    }
    // One shared 1s power-off/reset and USB settling interval. The hardware
    // initializer must not add another power-off wait. This is nonblocking:
    // keyboard scanning, raw HID and flash rendezvous continue normally.
    if(!power_known){dl_hw_off();power_known=true;}
    if(!settling){settling=true;settle_started=dl_now();return false;}
    if((uint32_t)(dl_now()-settle_started)<1000)return false;
    if(attempts>=3)return false;
    if(retry_pending&&(uint32_t)(dl_now()-failed_at)<1000)return false;
    attempts++;
    const bool ok=dl_hw_init();
    __sync_synchronize();
    if(!ok||suspended||user_off){
        dl_hw_off();powered=false;retry_pending=!ok;failed_at=dl_now();
        if(suspended||user_off){settling=false;attempts=0;}
        return false;
    }
    retry_pending=false;settling=false;powered=true;return true;
}
