# Athena firmware corresponding source

The manifest offers Athena75 display-r5 and Athena1800 screen-r2 previews.

- Athena75 display-r5: https://github.com/kbdfans/athena-studio/releases/tag/firmware-preview-20261111-r5
  Complete source mirror: https://kbd.cool/studio/firmware/athena-firmware-source-20261111-r5.tar.gz
- Athena1800 screen-r2 (and the retained Athena75 display-r4): https://github.com/kbdfans/athena-studio/releases/tag/firmware-preview-20261111
  Complete source mirror: https://kbd.cool/studio/firmware/athena-firmware-source-20261111.tar.gz

Each source archive includes the pinned QMK tree, library submodules, model-specific modifications, build instructions, editable artwork/font inputs and licenses. SHA-256 values are in releases.json. Build with Arm GNU 13.2.rel1. The older r4/r2 release was reproduced byte-for-byte; display-r5 has build, host-test, full-device-readback and user acceptance evidence, without a separate clean-tree reproduction claim.

GPL-2.0-only applies to project additions except where existing per-file notices state otherwise; upstream licenses and Inter's SIL OFL-1.1 remain intact. No device backups or user configurations are included. See design/upgrade-policy.md in the repository for migration rules and validation limits.
