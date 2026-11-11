// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <stdint.h>
#include <stdbool.h>
// True means the dedicated mode key was consumed (including its release).
bool screen_mode_key(uint16_t code,bool pressed);
