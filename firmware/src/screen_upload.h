// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

enum { SU_INFO=0, SU_READ=1, SU_BEGIN=2, SU_DATA=3, SU_COMMIT=4, SU_ABORT=5, SU_RECOVER=6 };
enum { SU_OK=0, SU_COMMAND=1, SU_BUSY=2, SU_RANGE=3, SU_ORDER=4, SU_CRC=5, SU_FLASH=6, SU_FORMAT=7 };
// Platform hooks always receive offsets relative to the start of Flash.
const uint8_t *su_flash_ptr(uint32_t offset);
bool su_flash_erase(uint32_t offset);
bool su_flash_program(uint32_t offset, const uint8_t page[256]);
void su_display_pause(bool paused);
void su_display_recover(void);
void su_diagnostics(uint8_t packet[32]);
uint32_t su_millis(void);
void su_receive(uint8_t packet[32]);
void su_task(void);
uint32_t su_crc32(uint32_t crc, const uint8_t *data, size_t length);
