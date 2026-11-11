// SPDX-License-Identifier: GPL-2.0-or-later
#include "pet.h"
#include "typing.h"
#include "screen_upload.h"
#include "pet_default.h"
#include <string.h>
#define SAVE_BASE 0xdfe000u
#define XP_MAX 2000000u
static volatile pet_status_t state;
static uint32_t last_key,last_xp,activity_clock,last_save,dirty_since,interaction_start,save_sequence;
static uint8_t activity;
static uint8_t interaction,save_index;
static bool has_save,force_save;
static uint32_t care_clock,metabolism_ms,run_ms,hunger_ms;
static uint8_t completed_jumps,jump_gait,jump_entry_lift;
static bool jump_pending,settings_save_pending;
static uint32_t settings_changed;
#define HP_IDLE_MS 300000u
#define HP_RUN_MS 60000u
#define HUNGER_XP_MS 600000u
#define SLEEP_IDLE_MS 30000u
static void care_update(uint32_t now);
static uint32_t u32(const uint8_t *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(8*i);}
static uint32_t crc(const uint8_t *p){return su_crc32(0xffffffffu,p,20)^0xffffffffu;}
static uint16_t u16(const uint8_t *p){return p[0]|(uint16_t)p[1]<<8;}
bool pet_is40(const uint8_t *p){return p[2]==52&&p[3]==48;}
bool pet_pack_header_valid(const uint8_t *p){
    static const uint8_t old[]={80,84,51,50,1,32,32,2,6,4}, modern[]={80,84,52,48,1,40,32,2,8,44};
    if(pet_is40(p)){
        if(memcmp(p,modern,10)||u32(p+12)!=14336)return false;
        for(unsigned a=0;a<8;a++){
            if(!p[24+a]||p[24+a]>8)return false;
            for(unsigned f=0;f<p[24+a];f++){uint16_t ms=u16(p+96+a*16+f*2);if(p[32+a*8+f]>=44||ms<50||ms>2000)return false;}
        }
        return true;
    }
    if(memcmp(p,old,10)||u32(p+12)!=6400||u16(p+10)<80||u16(p+10)>1000)return false;
    if(p[24]==1)for(unsigned i=0;i<24;i++){uint16_t ms=u16(p+32+i*2);if(ms<50||ms>2000)return false;}
    return true;
}
const uint8_t *pet_active_pack(void){const uint8_t *p=su_flash_ptr(0xa00000);return pet_pack_header_valid(p)?p:pet_default;}
static uint16_t frame_ms(const uint8_t *p,uint8_t a,uint8_t f){return u16(p+(pet_is40(p)?96+a*16+f*2:p[24]==1?32+a*8+f*2:10));}
uint32_t pet_duration(const uint8_t *p,uint8_t a){
    if(a>=8)return 0;
    if(!pet_is40(p)&&a>=6)return 2400;
    unsigned count=pet_is40(p)?p[24+a]:4;uint32_t total=0;
    for(unsigned f=0;f<count;f++)total+=frame_ms(p,a,f);
    return total;
}
uint8_t pet_frame(const uint8_t *p,uint8_t a,uint32_t elapsed){
    if(a>=8)return 0;
    bool modern=pet_is40(p);if(!modern&&a>=6)a=0;
    uint32_t total=pet_duration(p,a);if(!total)return 0;
    if(modern&&a>=4){if(elapsed>=total)elapsed=total-1;}else elapsed%=total;
    unsigned count=modern?p[24+a]:4;
    for(unsigned f=0;f<count;f++){uint16_t ms=frame_ms(p,a,f);if(elapsed<ms)return f;elapsed-=ms;}return 0;
}
uint32_t pet_pixel_offset(const uint8_t *p,uint8_t a,uint8_t f){return pet_is40(p)?256u+p[32+a*8+f]*320u:256u+((a<6?a:0)*4+f)*256u;}
uint8_t pet_lift(const uint8_t *p,uint8_t a,uint32_t elapsed){
    if(!pet_is40(p)||(a!=2&&a!=6))return 0;
    static const uint8_t run[]={0,1,4,0,0,2,5,0},jump[]={0,0,3,15,24,14,0,0};
    unsigned f=pet_frame(p,a,elapsed);if(a==2)return run[f];
    for(unsigned i=0;i<f;i++)elapsed-=frame_ms(p,a,i);
    uint32_t ms=frame_ms(p,a,f);if(elapsed>ms)elapsed=ms;
    int h=jump[f],next=jump[f<7?f+1:7];
    // Positive weighted sum matches browser Math.floor, including descending phases.
    return (h*(ms-elapsed)+next*elapsed)/ms;
}
#define JUMP_TAKEOFF_MS 80u
#define JUMP_LANDING_MS 90u
uint32_t pet_animation_elapsed(const pet_status_t *s,uint32_t now){
    uint32_t age=now-s->action_started;
    if(s->action!=6||!s->jump_duration)return age;
    uint32_t airborne=s->jump_landing-s->jump_takeoff;
    if(age<JUMP_TAKEOFF_MS)return s->jump_takeoff*age/JUMP_TAKEOFF_MS;
    age-=JUMP_TAKEOFF_MS;
    if(age<airborne)return s->jump_takeoff+age;
    age-=airborne;
    if(age>JUMP_LANDING_MS)age=JUMP_LANDING_MS;
    uint32_t recovery=s->jump_duration-s->jump_landing;
    return s->jump_landing+recovery*age/JUMP_LANDING_MS;
}
static uint32_t interaction_duration(const uint8_t *pack,uint8_t action){
    if(action==6&&state.jump_duration)return JUMP_TAKEOFF_MS+state.jump_landing-state.jump_takeoff+JUMP_LANDING_MS;
    return pet_duration(pack,action);
}
static void start_jump(const uint8_t *pack,uint32_t now){
    jump_gait=state.action==1||state.action==2?state.action:0;
    jump_entry_lift=pet_lift(pack,state.action,now-state.action_started);
    state.jump_duration=0;
    if(jump_gait&&pet_is40(pack)&&pack[24+6]==8){
        state.jump_takeoff=frame_ms(pack,6,0)+frame_ms(pack,6,1);
        state.jump_landing=state.jump_takeoff;
        for(uint8_t frame=2;frame<6;frame++)state.jump_landing+=frame_ms(pack,6,frame);
        state.jump_duration=pet_duration(pack,6);
    }
}
static uint8_t growth(void){return state.xp<10?0:state.xp<200?1:2;}
static void decay_activity(uint32_t now){
    uint32_t steps=(uint32_t)(now-activity_clock)/100;
    if(steps){activity=steps>=activity?0:activity-steps;activity_clock+=steps*100;}
}
void pet_status(pet_status_t *out){*out=state;}
static void dirty(void){if(!state.dirty)dirty_since=su_millis();state.dirty=1;}
static bool valid_save(const uint8_t *p){return !memcmp(p,"PET2",4)&&u32(p+20)==crc(p)&&p[16]<3&&p[17]<3&&p[18]<=100&&u32(p+8)<=XP_MAX;}
void pet_init(void){
    memset((void *)&state,0,sizeof state);state.fullness=80;state.level=1;
    metabolism_ms=run_ms=hunger_ms=0;completed_jumps=0;jump_pending=false;
    has_save=force_save=settings_save_pending=false;
    typing_settings config;typing_settings_default(&config);activity=interaction=0;save_sequence=0;save_index=0;
    for(unsigned i=0;i<32;i++){
        const uint8_t *p=su_flash_ptr(SAVE_BASE+i*256);
        if(valid_save(p)&&(!has_save||(int32_t)(u32(p+4)-save_sequence)>0)){
            has_save=true;save_index=i;save_sequence=u32(p+4);
            state.xp=u32(p+8);state.keys=u32(p+12);state.mode=p[16];state.image=p[17];state.fullness=p[18];
            metabolism_ms=run_ms=hunger_ms=0;completed_jumps=0;
            typing_settings_default(&config);
            if(!memcmp(p+48,"TYPE",4)&&u32(p+68)==(su_crc32(0xffffffffu,p+48,20)^0xffffffffu)){typing_settings saved;memcpy(&saved,p+52,sizeof saved);if(typing_settings_valid(&saved))config=saved;}
            if(p[19]==3&&!memcmp(p+24,"CARE",4)&&u32(p+44)==(su_crc32(0xffffffffu,p+24,20)^0xffffffffu)&&u32(p+28)<HP_RUN_MS&&u32(p+32)<HUNGER_XP_MS&&u32(p+36)<HP_IDLE_MS&&p[40]<5){
                run_ms=u32(p+28);hunger_ms=u32(p+32);metabolism_ms=u32(p+36);completed_jumps=p[40];
            }
        }
    }
    typing_settings_set(&config);
    state.sequence=save_sequence;state.level=1+(state.xp/200>19?19:state.xp/200);
    last_key=last_xp=activity_clock=care_clock=last_save=dirty_since=interaction_start=su_millis();state.action_started=last_key;state.stage=growth();state.ready=1;
}
void pet_key(bool space){
    if(!state.ready||state.mode!=1)return;
    uint32_t now=su_millis();care_update(now);last_key=now;decay_activity(now);
    activity=activity>36?40:activity+4;
    const uint8_t *pack=pet_active_pack();
    bool busy=interaction&&(uint32_t)(now-interaction_start)<interaction_duration(pack,interaction);
    if(!busy&&(state.action==3||space)){
        interaction=state.action==3?7:6;interaction_start=now;jump_pending=interaction==6;
        if(jump_pending)start_jump(pack,now);
        state.action=interaction;state.action_started=now;
    }
    if(state.keys<0xffffffffu)state.keys++;
    if((uint32_t)(now-last_xp)>=1000){last_xp=now;if(state.xp<XP_MAX)state.xp++;}
    dirty();
}
static bool blank(const uint8_t *p){for(int i=0;i<256;i++)if(p[i]!=255)return false;return true;}
static bool save(void){
    uint8_t page[256];memset(page,255,sizeof page);memcpy(page,"PET2",4);
    put32(page+4,save_sequence+1);put32(page+8,state.xp);put32(page+12,state.keys);
    page[16]=state.mode;page[17]=state.image;page[18]=state.fullness;page[19]=3;put32(page+20,crc(page));
    memcpy(page+24,"CARE",4);put32(page+28,run_ms);put32(page+32,hunger_ms);put32(page+36,metabolism_ms);page[40]=completed_jumps;
    put32(page+44,su_crc32(0xffffffffu,page+24,20)^0xffffffffu);
    typing_settings config;typing_settings_get(&config);memcpy(page+48,"TYPE",4);memcpy(page+52,&config,sizeof config);put32(page+68,su_crc32(0xffffffffu,page+48,20)^0xffffffffu);
    // Append in the current sector. Switch only when full; the previous valid record survives a torn write.
    unsigned bank=has_save?save_index/16:0, next=has_save?save_index+1:0;
    while(next<(bank+1)*16&&!blank(su_flash_ptr(SAVE_BASE+next*256)))next++;
    if(next>=(bank+1)*16){bank=1-bank;next=bank*16;if(!su_flash_erase(SAVE_BASE+bank*4096))return false;}
    else if(!has_save&&next==0&&!blank(su_flash_ptr(SAVE_BASE))){if(!su_flash_erase(SAVE_BASE))return false;}
    if(!su_flash_program(SAVE_BASE+next*256,page)||memcmp(su_flash_ptr(SAVE_BASE+next*256),page,256))return false;
    save_index=next;save_sequence++;has_save=true;state.sequence=save_sequence;return true;
}
// Account at event boundaries, including delayed ticks and uint32 clock rollover.
// Counters pause in image mode, sleep and while unplugged. Clip delayed ticks at
// the actual sleep boundary, rather than charging an entire unattended night.
static void care_update(uint32_t now){
    uint32_t left=(uint32_t)(now-care_clock),idle=(uint32_t)(care_clock-last_key);
    uint32_t running=state.action==2&&idle<900?900-idle:0;
    uint32_t jump_left=0;
    if(jump_pending){uint32_t age=(uint32_t)(care_clock-interaction_start),duration=interaction_duration(pet_active_pack(),6);jump_left=age<duration?duration-age:0;}
    care_clock=now;if(state.mode!=1)return;
    uint32_t awake=idle<SLEEP_IDLE_MS?SLEEP_IDLE_MS-idle:0;
    if(left>awake)left=awake;
    uint8_t before_hp=state.fullness,before_jumps=completed_jumps;
    uint32_t before_xp=state.xp,before_minute=hunger_ms/60000;
    while(left||(jump_pending&&!jump_left)){
        if(jump_pending&&!jump_left){jump_pending=false;if(++completed_jumps==5){completed_jumps=0;if(state.fullness)state.fullness--;}}
        if(!left)break;
        uint32_t step=left;
        if(step>HP_IDLE_MS-metabolism_ms)step=HP_IDLE_MS-metabolism_ms;
        if(running){if(step>running)step=running;if(step>HP_RUN_MS-run_ms)step=HP_RUN_MS-run_ms;}
        if(jump_pending&&step>jump_left)step=jump_left;
        if(!state.fullness&&step>HUNGER_XP_MS-hunger_ms)step=HUNGER_XP_MS-hunger_ms;
        if(!state.fullness)hunger_ms+=step;else hunger_ms=0;
        metabolism_ms+=step;
        if(running){run_ms+=step;running-=step;}
        if(jump_pending)jump_left-=step;
        left-=step;
        if(metabolism_ms==HP_IDLE_MS){metabolism_ms=0;if(state.fullness)state.fullness--;}
        if(run_ms==HP_RUN_MS){run_ms=0;if(state.fullness)state.fullness--;}
        if(hunger_ms==HUNGER_XP_MS){hunger_ms=0;if(state.xp)state.xp--;}
    }
    if(before_hp!=state.fullness||before_xp!=state.xp||before_jumps!=completed_jumps||before_minute!=hunger_ms/60000)dirty();
    state.level=1+(state.xp/200>19?19:state.xp/200);state.stage=growth();
}
void pet_tick(void){
    if(!state.ready)return;
    uint32_t now=su_millis();
    care_update(now);
    decay_activity(now);
    state.level=1+(state.xp/200>19?19:state.xp/200);
    state.stage=growth();
    const uint8_t *pack=pet_active_pack();
    uint8_t previous=state.action,next;
    if(interaction&&(uint32_t)(now-interaction_start)<interaction_duration(pack,interaction))next=interaction;
    else {
        interaction=0;
        uint32_t idle=(uint32_t)(now-last_key);
        bool running=previous==2||(previous==6&&jump_gait==2);
        next=idle>=SLEEP_IDLE_MS?3:idle<900&&activity?(activity>=(running?10:16)?2:1):0;
    }
    if(next!=previous){
        state.action=next;state.action_started=now;
        if(previous==6&&next==2&&pet_is40(pack)&&pack[24+2]>=4)
            state.action_started-=frame_ms(pack,2,0)+frame_ms(pack,2,1)+frame_ms(pack,2,2);
    }
    pet_status_t pose=state;
    uint32_t age=now-pose.action_started;
    state.jump=pet_lift(pack,next,pet_animation_elapsed(&pose,now));
    if(next==6&&pose.jump_duration&&age<JUMP_TAKEOFF_MS)
        state.jump+=(jump_entry_lift*(JUMP_TAKEOFF_MS-age)+JUMP_TAKEOFF_MS/2)/JUMP_TAKEOFF_MS;
    if(state.dirty&&!su_busy()&&(force_save||(settings_save_pending&&(uint32_t)(now-settings_changed)>=1500&&(uint32_t)(now-last_save)>=2000)||((uint32_t)(now-dirty_since)>=1500&&(uint32_t)(now-last_save)>=60000))){
        state.save_error=!save();last_save=now;force_save=false;if(!state.save_error){state.dirty=0;settings_save_pending=false;}
    }
}
void pet_command(uint8_t op,uint32_t value,uint8_t p[32]){
    if(!state.ready){p[5]=SU_BUSY;return;}
    care_update(su_millis());
    switch(op){
        case 16:break;
        case 17:if(value>2){p[5]=SU_RANGE;return;}typing_clear();state.mode=value;jump_pending=false;if(value){last_key=su_millis();activity=0;interaction=0;state.action=0;state.action_started=last_key;}dirty();force_save=true;break;
        case 18:if(state.mode!=1){p[5]=SU_ORDER;return;}jump_pending=false;hunger_ms=metabolism_ms=0;state.fullness=state.fullness>80?100:state.fullness+20;interaction=4;interaction_start=last_key=su_millis();state.action=4;state.action_started=interaction_start;dirty();break;
        case 19:if(state.mode!=1){p[5]=SU_ORDER;return;}jump_pending=false;interaction=5;interaction_start=last_key=su_millis();state.action=5;state.action_started=interaction_start;break;
        case 20:if(value>2){p[5]=SU_RANGE;return;}typing_clear();state.image=value;state.mode=0;jump_pending=false;dirty();force_save=true;break;
        case 21:dirty();force_save=true;break;
        default:p[5]=SU_COMMAND;return;
    }
    p[6]=state.mode;p[7]=state.image;p[8]=state.action;p[9]=state.level;p[10]=state.fullness;p[11]=state.dirty;
    put32(p+12,state.xp);put32(p+16,state.keys);put32(p+20,u32(pet_active_pack()+12));put32(p+24,state.sequence);p[28]=state.save_error;p[29]=state.ready;p[30]=13;p[31]=state.stage;
}

void pet_typing_config(uint8_t op,const uint8_t data[16],uint8_t p[32]){
 if(!state.ready){p[5]=SU_BUSY;return;}
 if(op==23){typing_settings next;memcpy(&next,data,sizeof next);if(!typing_settings_valid(&next)){p[5]=SU_RANGE;return;}
  typing_settings current;typing_settings_get(&current);if(memcmp(&next,&current,sizeof next)){typing_settings_set(&next);typing_clear();dirty();settings_save_pending=true;settings_changed=su_millis();}
 }
 typing_settings config;typing_settings_get(&config);memcpy(p+6,&config,sizeof config);p[22]=state.dirty;p[23]=state.save_error;
}
