# ZMK model catalog

Verified on 2026-11-11 against the [user-provided download catalog](https://openkbd.github.io/#/zmk/download/). These entries select the shared ZMK USB transport; they do not install firmware or substitute static keyboard geometry.

Each pinned `build.yaml` enables `studio-rpc-usb-uart` and `-DCONFIG_ZMK_STUDIO=y`. USB VID is `0x9D5B`; the PIDs below are source evidence, not a hard filter that would exclude older variants.

| Keyboard | Source snapshot | USB PID |
| --- | --- | --- |
| Agar BLE | [openkbd/zmk-config-agar-ble](https://github.com/openkbd/zmk-config-agar-ble/tree/f022c62df122e2aefe40bd404da285b1ba686b60) | 0x2565 |
| Agar Mini BLE | [openkbd/zmk-config-agar-mini-ble](https://github.com/openkbd/zmk-config-agar-mini-ble/tree/76566f51623a8c06aaa3d1c05a5c04df648125e0) | 0x2561 |
| Tofu60 BLE 3.0 | [openkbd/zmk-config-tofu60-ble-3.0](https://github.com/openkbd/zmk-config-tofu60-ble-3.0/tree/9a9cb0255d1dcbe7895d2d113cd2a74e17ae13bd) | 0x2562 |
| Tofu65 BLE 3.0 | [openkbd/zmk-config-tofu65-ble-3.0](https://github.com/openkbd/zmk-config-tofu65-ble-3.0/tree/972294e85024da68d068dfa91f167e5657420afd) | 0x2563 |
| Tofu TKL BLE 3.0 | [openkbd/zmk-config-tofu-tkl-ble-3.0](https://github.com/openkbd/zmk-config-tofu-tkl-ble-3.0/tree/858ef9ce438fe832c82cd935650e6bbd836f424c) | 0x2564 |
| Tofu Pad BLE | [openkbd/zmk-config-tofu-pad-ble](https://github.com/openkbd/zmk-config-tofu-pad-ble/tree/b2c5e6a65203c8a667dd139b310ddd8091ab1a2c) | 0x2566 |

Agar Micro remains a separate existing entry based on the user's successful live identification/remap/persistence test. It is not relabeled Agar or Agar Mini.

All model names use the same metadata-driven keymap, behavior and layout editor. A board must expose Studio RPC in its installed firmware. Layouts are read from the connected firmware: separate ANSI/ISO/spacebar build targets in a repository do not imply that one installed image supports switching all those layouts.

Validation boundary: the six source entries were checked and their catalog/transport routing was tested. They have not all been physically tested. Agar Micro is the only ZMK hardware acceptance recorded in this session. No upstream source files or firmware binaries are redistributed by this catalog addition.
