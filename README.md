# Athena Studio

Open-source browser configurator for KBDfans Athena75/Athena1800 and keyboards exposing ZMK Studio over USB serial.

- China: https://kbd.cool/studio/
- International: https://v.kbd.cool/studio/

## Features

Immediate key remapping, layers, advanced QMK functions, physical keyboard testing, GIF/image crop and upload, customizable pixel cats, and typing-ball animation settings. The editor and screen dialogs share one WebHID connection. Images are processed locally; recent media is stored in the current browser. Desktop Chrome or Edge with WebHID and HTTPS (or localhost) is required. Browser authorization is required at each site origin; permissions and cached media do not transfer between the two domains.

## Connection

Choose the keyboard name, then click Connect. First use requires the browser device chooser. On later visits the model choice is remembered; clicking Connect reuses an unambiguous matching permission where available. Serial permissions are reused only for a USB identity successfully recognized by this site before. Multiple matching devices, revoked permission or an explicit **Authorize again / choose another device** action open the chooser. Connected model names always come from the actual device, not the selection hint. Permissions are separate for the two site origins.

## Device support

Athena75 and Athena1800 have separate matrix definitions and VID/PID checks. Original supported Vial firmware supports key mapping; screen upload, pets and typing mode require the matching Screen Studio firmware. This website does not automatically flash firmware. Do not flash Athena75 firmware onto Athena1800.

Athena1800 screen playback, pets, typing mode and keyboard input have passed initial hardware checks. Athena75 has an intermittent black-screen issue under investigation; a host reboot restored the latest reported occurrence, but the root cause is not established. Model-specific preview firmware is available in `public/firmware`; complete corresponding source is linked in `public/firmware/SOURCES.md`. No device Flash backups or private configuration data are distributed.

## Development

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
# Open http://127.0.0.1:8770/studio-v2.html
npm test
npm run build:hosted
```

Serve `dist/` at `/studio/` over HTTPS. `index.html` in the hosted build is the current integrated configurator. The development root retains the historical image tool for source compatibility. Hosted builds contain the license and third-party notices. A minimal static Docker deployment is provided below.

```sh
docker build -t athena-studio .
docker run --rm -p 8080:80 athena-studio
# http://localhost:8080/studio/ (use HTTPS for a public deployment)
```

## Assets and firmware development

The original mint-cat artwork, intermediate sprite sheets and processing scripts are in `design/mint-cat-v1`, `mint-cat-v2`, and `mint-cat-v3`; these were created with AI assistance. `npm run build:pet` rebuilds packed cat/scene resources. Rasterized Inter glyphs can be regenerated with Pillow and `scripts/build-typing-font.py`; see THIRD_PARTY.md for the font source and hash.

Experimental firmware adapters target `openkbd/vial-qmk-v6` commit `be6d662bf0412c784f586e68e919547e715fbdba`. They require that upstream source tree and its QMK toolchain/submodules. The complete release-source archive includes the pinned upstream tree and library submodules. The earlier display-r4 and screen-r2 binaries were reproduced byte-for-byte with Arm GNU 13.2.rel1. The display-r5 source archive is the exact build source and its install passed full Flash readback; an independent byte-identical rebuild of r5 has not been claimed. The native model tests can be run with `npm run test:pet` and `npm run test:typing` using a C compiler.

## License

GPL-2.0-only; see [LICENSE](LICENSE). Preserve the original per-file and dependency licenses. MIT dependency notices and SIL OFL-1.1 for Inter glyph assets are in [THIRD_PARTY.md](THIRD_PARTY.md) and `licenses/`. User-provided media is not licensed by this project. KBDfans/Athena identifiers do not grant trademark rights.

## Demo and language defaults

Select **Try demo mode** to preview Athena75 or Athena1800 without connecting a device. Keymap edits stay in memory, screen modes can be previewed, and hardware write actions remain disabled. Connecting a real keyboard reads its configuration; demo edits are never replayed.

A first visit to `v.kbd.cool` uses English; `kbd.cool` and `www.kbd.cool` use Simplified Chinese. Explicit language choices persist per origin. English covers the complete interface, dynamic messages, and errors; other locales use English for entries without a native translation. Translation sources are `src/locales/ui.txt`, `help-en.txt`, `site-en.txt`, and `templates-en.js`. Run `node scripts/build-locales.mjs` after editing the catalog.

## ZMK Studio

The keyboard-name list includes all six models in the supplied openkbd source catalog: Agar BLE, Agar Mini BLE, Tofu60 BLE 3.0, Tofu65 BLE 3.0, Tofu TKL BLE 3.0 and Tofu Pad BLE. The hardware-tested Agar Micro entry is retained separately. See [pinned source evidence and validation limits](design/zmk-model-catalog.md).

Choose your keyboard name (for example, **Agar Micro** or **Tofu60 BLE 3.0**) when connecting. The website chooses the transport internally. The firmware must expose ZMK Studio RPC over USB. Basic and Advanced use native ZMK behaviors, with explanations, examples, named parameters and modifier shortcuts. Assignment applies immediately, is read back, and is automatically saved to the keyboard. Available functions and physical layouts come from the device. Single-layout firmware shows a read-only layout; additional layout variants require firmware support.

Agar Micro BLE was hardware-tested: identification and geometry, immediate Esc-to-A remapping, persistence after USB reconnect, and restoring Esc all passed. Its firmware provides one layout. Multiple-layout switching is simulation-tested only. Compiled macros/hold-tap behaviors can be assigned, but their internal definitions and timing cannot be edited through this RPC. See [ZMK support and limitations](design/zmk-support.md).

## Online firmware upgrade

Disconnect USB, hold **Esc** while reconnecting, then release Esc when **RPI-RP2** appears. First-use WebUSB authorization is required; previously authorized RP2 Boot devices are automatically detected. The guide survives USB disconnects and Esc cannot dismiss it.

Athena75 display-r5 and Athena1800 screen-r2 are offered with complete corresponding source. Display-r5 hardware installation, full Flash verification, display/typing and current-version identification passed. When the device reports the current release, the dialog only displays that it is up to date. Matching main-program bytes also block a repeated upgrade before erasure. Newer firmware is not downgraded.

Known firmware upgrades preserve keyboard configuration, clear all old images after explicit confirmation, and preserve compatible v2 pet resources. Unknown historical firmware is not accepted by its name alone: it requires a verified normal-mode identity/keymap snapshot, Flash capacity checks and a separate explicit factory-reset consent. A full recovery backup is verified before any write; the complete Flash image is read back before reboot. The unknown-version reset path has protocol/browser simulation coverage, not customer-hardware acceptance. See [upgrade policy and validation boundaries](design/upgrade-policy.md).

## Anonymous bug reports

The header and footer open an anonymous feedback form: product model, issue
description, optional screenshots and optional previewable diagnostics. The footer
identifies the site as built with AI assistance. GIF/image editing remains local;
only explicit feedback submissions upload their report and selected screenshots.

Both public deployments use a private inbox at `https://kbd.cool/studio/inbox.html`.
It requires the existing kbd.cool administrator account. The new standalone Node
service runs separately from the host website and stores reports on a persistent
volume. See [deployment and privacy details](server/feedback/README.md).

Run `npm run start:feedback` with the documented authorization and storage settings
when self-hosting. Never expose administrator API responses anonymously.
