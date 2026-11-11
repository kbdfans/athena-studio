// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <stdint.h>
#include <stdbool.h>
#define TYPE_MAX 16
#define TYPE_Q 256
typedef struct {uint8_t version,size,weight,mode;uint16_t colors[4],background,grid;} typing_settings;
_Static_assert(sizeof(typing_settings)==16,"typing settings wire layout");
void typing_settings_default(typing_settings *s);
bool typing_settings_valid(const typing_settings *s);
uint32_t typing_settings_get(typing_settings *s);
bool typing_settings_set(const typing_settings *s);
uint8_t typing_color_class(uint8_t glyph,uint8_t mode,uint8_t random);
typedef struct {int32_t x,y,vx,vy;uint16_t life;uint8_t glyph,color,radius;} typing_ball;
typedef struct {typing_ball balls[TYPE_MAX];uint8_t count;uint32_t rng,last_shot;bool has_shot;typing_settings settings;} typing_world;
void typing_init(typing_world *w,uint32_t seed);
void typing_spawn(typing_world *w,uint8_t glyph,uint32_t now);
void typing_step(typing_world *w,uint32_t ms);
void typing_collide(typing_ball *a,typing_ball *b);
uint8_t typing_ascii(uint16_t key,uint8_t mods);
void typing_key(uint16_t key,uint8_t mods,uint32_t now);
void typing_clear(void);
bool typing_pop(uint8_t *glyph,uint32_t *time);
void typing_render(const void *display,bool force);
