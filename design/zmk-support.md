# ZMK Studio integration

The shared console connects ZMK firmware over Web Serial in desktop Chrome/Edge. It uses native behavior IDs and 32-bit binding parameters; it never translates QMK's internal keycodes into ZMK bindings. Only firmware exposing ZMK Studio RPC is supported. Screen tools and Athena/RP2040 upgrades are not shown for ZMK devices.

## Editing and persistence

Select a physical key, choose a basic key or configure an advanced behavior. Assignment applies immediately, reads back the keymap, and automatically commits after a short debounce. The queue serializes edits and commits. The UI only reports "Saved to keyboard" after the save succeeds and the device reports no remaining unsaved changes. Reconnecting reads fresh state; failed operations are never silently replayed. Existing unsaved device edits require an explicit keep/discard choice. A failed verification requires a new read before further writes.

## Basic and advanced

Basic: ANSI TKL palette, keypad, consumer media usages, common layer controls, Bluetooth/output, mouse behaviors and physical layouts.
Advanced: keys/shortcuts, layers/dual functions, wireless/device, lighting/power, mouse, maintenance and firmware-defined behaviors. Every behavior has an explanation and example; known behaviors have named parameters. Native HID inputs support eight modifier bits. Available constants, ranges, layers and HID limits come from the device, not a fixed assumption about every ZMK keyboard.

Hold-tap, macros, Tap Dance, Mod-Morph and combos are not QMK configuration records. This RPC can assign compiled behaviors and exposed binding parameters; it does not edit their internal definitions, macro sequences, timing or combo triggers. Custom behaviors keep their actual device names and explicit documentation limits. Preset behaviors absent from a keyboard's firmware are not fabricated.

## Physical layouts

Use the actual layouts reported by the device, including rotation coordinates and real layer IDs. Multiple layouts can be selected, read back and committed automatically. A single layout is displayed as read-only current layout. Geometry-only visual switching does not pretend to change the matrix. Additional ANSI/ISO/bottom-row combinations must already exist in that keyboard's firmware.

## Validation (2026-11-11)

Agar Micro BLE (USB): the user confirmed correct identification and geometry; a temporary Esc-to-A assignment applied immediately, survived a USB disconnect/reconnect, and was restored to Esc. Its firmware provides one Default layout, confirmed by the user. Multi-layout switching has protocol/browser simulation coverage, but was not physically exercised on this one-layout PCB. Other ZMK models have not been hardware-accepted by this change.

Sources: [Studio](https://zmk.dev/docs/features/studio), [layers](https://zmk.dev/docs/keymaps/behaviors/layers), [hold-tap](https://zmk.dev/docs/keymaps/behaviors/hold-tap), [sticky key](https://zmk.dev/docs/keymaps/behaviors/sticky-key), [Bluetooth](https://zmk.dev/docs/keymaps/behaviors/bluetooth), [native RPC client](https://github.com/zmkfirmware/zmk-studio-ts-client).
