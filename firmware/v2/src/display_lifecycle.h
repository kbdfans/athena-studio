// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <stdbool.h>
#include <stdint.h>
// Host/keyboard core only publishes intent. The display core owns all I/O.
void dl_set_suspended(bool value);
void dl_set_off(bool value);
void dl_request_reinit(void);
bool dl_task(void);
uint8_t dl_flags(void);
// Display-core platform hooks. Initialization must include a hardware reset.
bool dl_hw_init(void);
void dl_hw_off(void);
uint32_t dl_now(void);
