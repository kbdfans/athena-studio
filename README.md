# Athena Studio

Open-source browser configurator for KBDfans Athena75 and Athena1800.

- China: https://kbd.cool/studio/
- International: https://v.kbd.cool/studio/

## Features

Immediate key remapping, layers, advanced QMK functions, physical keyboard testing, GIF/image crop and upload, customizable pixel cats, and typing-ball animation settings. The editor and screen dialogs share one WebHID connection. Images are processed locally; recent media is stored in the current browser. Desktop Chrome or Edge with WebHID and HTTPS (or localhost) is required. Browser authorization is required at each site origin; permissions and cached media do not transfer between the two domains.

## Device support

Athena75 and Athena1800 have separate matrix definitions and VID/PID checks. Original supported Vial firmware supports key mapping; screen upload, pets and typing mode require the matching Screen Studio firmware. This website does not automatically flash firmware. Do not flash Athena75 firmware onto Athena1800.

Athena1800 screen playback, pets, typing mode and keyboard input have passed initial hardware checks. Athena75 has an intermittent black-screen issue under investigation; a host reboot restored the latest reported occurrence, but the root cause is not established. Included firmware source/adapters are experimental development material, not a general firmware-upgrade release. No device Flash backups or prebuilt firmware are distributed here.

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

Experimental firmware adapters target `openkbd/vial-qmk-v6` commit `be6d662bf0412c784f586e68e919547e715fbdba`. They require that upstream source tree and its QMK toolchain/submodules. Hardware migration and device-specific recovery are intentionally not automated by this public web release. The native model tests can be run with `npm run test:pet` and `npm run test:typing` using a C compiler.

## License

GPL-2.0-only; see [LICENSE](LICENSE). Preserve the original per-file and dependency licenses. MIT dependency notices and SIL OFL-1.1 for Inter glyph assets are in [THIRD_PARTY.md](THIRD_PARTY.md) and `licenses/`. User-provided media is not licensed by this project. KBDfans/Athena identifiers do not grant trademark rights.

## Demo and language defaults

Select **Try demo mode** to preview Athena75 or Athena1800 without connecting a device. Keymap edits stay in memory, screen modes can be previewed, and hardware write actions remain disabled. Connecting a real keyboard reads its configuration; demo edits are never replayed.

A first visit to `v.kbd.cool` uses English; `kbd.cool` and `www.kbd.cool` use Simplified Chinese. Explicit language choices persist per origin. English covers the complete interface, dynamic messages, and errors; other locales use English for entries without a native translation. Translation sources are `src/locales/ui.txt`, `help-en.txt`, `site-en.txt`, and `templates-en.js`. Run `node scripts/build-locales.mjs` after editing the catalog.

## Online firmware upgrade (under device validation)

The illustrated bootloader guide uses: disconnect USB, hold **Esc** while reconnecting, then release Esc when **RPI-RP2** appears. The browser upgrade implementation checks model-specific firmware fingerprints, makes and verifies a full recovery backup, protects keyboard configuration, migrates supported legacy animations, and verifies flash before reboot. Public firmware binaries are not distributed by this release: the public write action remains unavailable until device testing and corresponding-source release preparation are complete. Synthetic transport tests and a local hardware test are distinct validation steps.
