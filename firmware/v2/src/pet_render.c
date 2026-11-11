// SPDX-License-Identifier: GPL-2.0-or-later
#include "pet.h"
#include "screen_upload.h"
#include "qp.h"
#include "timer.h"
#include <stdio.h>
#include "pet_scene.h"
static uint8_t row[256]; // Full-width scanline, still no full-screen framebuffer.
static uint8_t last_action=255,last_level=255,last_fullness=255,last_frame=255,last_stage=255,last_jump=255;
static uint32_t last_xp=0xffffffffu;
static uint8_t last_sleep_phase=255,last_ground_offset=255;
static scene_ground_t ground;
static unsigned egg_pixel(int x,int y,uint8_t frame){
    int dx=x-16,dy=y-18;
    if(dx*dx*144+dy*dy*81>81*144)return 0;
    if(dx*dx*121+dy*dy*64>64*121)return 1;
    if((x==13&&y==14)||(x==19&&y==21)||(x==14&&y==25))return 2;
    if(frame==3&&y==17&&x>=13&&x<=19)return ((x+y)&1)?1:3;
    return 3;
}
void pet_render(const void *display,bool force){
    pet_status_t s;pet_status(&s);if(!s.ready)return;
    uint32_t now=timer_read32();
    const uint8_t *pack=pet_active_pack();
    uint8_t action=s.action<8?s.action:0,frame=pet_frame(pack,action,pet_animation_elapsed(&s,now));
    const uint8_t *pixels=pack+pet_pixel_offset(pack,action,frame);
    uint8_t sleep_phase=action==3?((now-s.action_started)/250)%12:0;
    uint8_t ground_offset=scene_ground_tick(&ground,now,action,s.stage);
    bool changed=ground_offset!=last_ground_offset||s.xp!=last_xp||sleep_phase!=last_sleep_phase||force||action!=last_action||frame!=last_frame||s.stage!=last_stage||s.jump!=last_jump||s.level!=last_level||s.fullness!=last_fullness;
    if(!changed)return;
    unsigned source_width=pet_is40(pack)?40:32;
    unsigned width=s.stage==0?64:source_width==40?80:96,height=s.stage==0?64:source_width==40?64:96;
    int left=(128-width)/2,top=104-height-s.jump;
    char label[8];snprintf(label,sizeof label,"LV%u",s.level);
    if(!qp_viewport(display,0,0,127,127))return;
    for(int y=0;y<128;y++){
        for(int x=0;x<128;x++){
            unsigned c=0;
            if(x>=left&&x<left+(int)width&&y>=top&&y<top+(int)height){
                unsigned sx=(x-left)*(s.stage?source_width:32)/width,sy=(y-top)*32/height,i=sy*source_width+sx;
                c=s.stage?(pixels[i/4]>>((i%4)*2))&3:egg_pixel(sx,sy,frame);
            }
            uint16_t color=c?((uint16_t)pack[17+c*2]<<8)|pack[16+c*2]:scene_pixel(x,y,ground_offset);
            int32_t overlay=overlay_pixel(x,y,label,s.xp,s.fullness,action,now-s.action_started,s.level>=20);
            if(overlay>=0)color=overlay;
            row[x*2]=color>>8;row[x*2+1]=color;
        }
        if(!qp_pixdata(display,row,128))return;
    }
    qp_flush(display);
    last_ground_offset=ground_offset;last_xp=s.xp;last_sleep_phase=sleep_phase;
    last_action=action;last_frame=frame;last_stage=s.stage;last_jump=s.jump;last_level=s.level;last_fullness=s.fullness;
}
