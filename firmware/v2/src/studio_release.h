// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once
// Normal-mode build identity. Schema 1 retains the shipped EEPROM layout.
// Resource schema 2 is the three-image + pet layout, independent of build id.
#define ATHENA_RELEASE_SEQUENCE 2026111101u
#if defined(PRODUCT_ID) && PRODUCT_ID == 0x2513
#define ATHENA_RELEASE_PID 0x2513
#define ATHENA_RELEASE_BUILD "75-261111-1"
#elif defined(PRODUCT_ID) && PRODUCT_ID == 0x4100
#define ATHENA_RELEASE_PID 0x4100
#define ATHENA_RELEASE_BUILD "18-261111-1"
#endif
