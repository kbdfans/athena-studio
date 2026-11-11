# Firmware upgrade compatibility

The published targets are model-specific Athena75 display-r5 and Athena1800 screen-r2 previews. Never apply them to ZMK or another PCB family.

- Normal-mode build identity, where supported, supplies model, hardware revision, configuration/resource schema, build ID and release sequence. Current firmware shows a version-only dialog with no upgrade controls. Newer or mismatched hardware also cannot start an update through that dialog.
- Older firmware without version metadata can only be compared after reading Flash. The pure planner refuses an already matching program before image clearing, backup creation or erasing. The writer independently refuses same-program reset plans.
- Exact verified historical fingerprints retain the supported configuration/resource schema. Images are cleared only after the existing explicit image-reset confirmation.
- Unknown historical program fingerprints on the two recognized original RP2040/16 MB families require normal-mode model/UID/keymap evidence and an additional reset consent. This path resets key mappings, macros, layout settings, images, pet appearance and progression. It does not reinterpret unknown EEPROM bytes. The original keymap can be downloaded before proceeding.
- A complete 16 MB recovery backup is persisted and verified before erasing. The device is read again before writes to reject device substitution/content changes. Writes are range checked and verified per sector, then the complete image is verified. Interrupted writes retain recovery data and never automatically resume against a new source image.
- Unknown VID/PID, UID, board families, unsupported normal-mode protocols, conflicting model descriptors, and apparent Flash aliases remain blocked. This is not universal arbitrary-firmware flashing.

## Version identity firmware

Display-r5 adds only read-only command 14 (ASF1) to the previously tested display-r4 firmware. The original display initializer, keymap, EEPROM and resource layout remain unchanged. Athena75 was installed with a fresh full backup, verified byte-for-byte across 16 MB, and accepted by the user for display orientation, typing and current-version detection on 2026-11-11.

Athena1800 remains on the hardware-accepted screen-r2 download. A screen-r3 version-identity build exists only as an engineering candidate; it is not offered by the manifest until hardware validation. The corresponding-source r5 archive includes its source for completeness.

Unknown-history reset has unit and browser simulation coverage including zero writes before consent and final readback; this destructive fallback was not physically exercised on the user's keyboard. Physical validation used a same-layout main-program update preserving existing data. Hardware reliability across all cables/hosts is not implied.
