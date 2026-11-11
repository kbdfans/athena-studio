// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <stdbool.h>
#include <stdint.h>
typedef struct { uint32_t xp,keys,sequence,action_started; uint16_t jump_takeoff,jump_landing,jump_duration; uint8_t mode,image,action,level,fullness,dirty,save_error,ready,stage,jump; } pet_status_t;
void pet_init(void);
void pet_tick(void);
void pet_key(bool space);
uint8_t pet_frame(const uint8_t *pack,uint8_t action,uint32_t elapsed);
void pet_command(uint8_t op,uint32_t value,uint8_t response[32]);
void pet_status(pet_status_t *out);
bool pet_pack_header_valid(const uint8_t *p);
void pet_render(const void *display,bool force);

bool pet_is40(const uint8_t *p);
const uint8_t *pet_active_pack(void);
uint32_t pet_duration(const uint8_t *p,uint8_t action);
uint32_t pet_pixel_offset(const uint8_t *p,uint8_t action,uint8_t frame);
uint32_t pet_animation_elapsed(const pet_status_t *status,uint32_t now);
uint8_t pet_lift(const uint8_t *p,uint8_t action,uint32_t elapsed);

void pet_typing_config(uint8_t op,const uint8_t data[16],uint8_t response[32]);
