# Athena layout source

`src/athena-definition.json` reproduces the Athena75 Vial definition and `src/athena-defaults.json` derives the default keymap from `openkbd/vial-qmk-v6`, commit `be6d662bf0412c784f586e68e919547e715fbdba`, under `keyboards/ydkb/athena75/keymaps/vial/`.

Source: https://github.com/openkbd/vial-qmk-v6/tree/be6d662bf0412c784f586e68e919547e715fbdba/keyboards/ydkb/athena75/keymaps/vial

The upstream repository supplies GNU GPL version 2 in its root LICENSE; a copy is retained at `licenses/vial-qmk-GPL-2.0.txt`. Preserve upstream copyright and licensing when redistributing these source-derived files. The normal-mode protocol code here was implemented against that pinned firmware's command definitions.

`src/qmk-catalog.js` is generated from `quantum/keycodes.h` at the same pinned commit (upstream copyright 2025 QMK, GPL-2.0-or-later). `scripts/generate-qmk-catalog.py` records the reproducible import and the feature whitelist for this board. Advanced entry layouts, settings IDs, and macro byte encoding follow `quantum/vial.c`, `vial.h`, `dynamic_keymap.c`, and `qmk_settings.c` in that checkout; newer upstream keycode numbers must not be substituted without migrating firmware and stored mappings together.


# Typing-mode glyphs

`firmware/v2/src/typing_font.h` and `public/typing-glyphs.json` contain 14/18/22 px rasterized glyphs at weights 400/700/850 from Inter v4.1 by Rasmus Andersson. Font source: https://github.com/rsms/inter/tree/v4.1 ; SIL Open Font License 1.1 is retained in `licenses/inter-OFL.txt`. Reproduce with `scripts/build-typing-font.py` and the upstream InterVariable.ttf (SHA256 `4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf`). The font itself is not renamed or redistributed as a standalone product; these embedded glyph assets retain their font license.

# Athena1800 layout

`src/athena1800-definition.json` and related defaults derive from the same pinned upstream repository, `keyboards/ydkb/athena1800/keymaps/vial/`. The upstream GPL notice remains applicable.

# Bundled JavaScript dependencies

- gifuct-js 2.1.2 — Matt Way, MIT. Source: https://github.com/matt-way/gifuct-js ; license: `licenses/gifuct-js-MIT.txt`.
- js-binary-schema-parser 2.0.3 — Matt Way, MIT. Source: https://github.com/matt-way/jsBinarySchemaParser ; license: `licenses/js-binary-schema-parser-MIT.txt`.
- Build and test dependencies retain their package-specific licenses, as recorded in package-lock.json and their installed packages.

# Original artwork

The mint cat and scene were created for this project with AI-assisted artwork and code-based pixel processing; editable source and processing scripts are in `design/mint-cat-v1`, `design/mint-cat-v2`, and `design/mint-cat-v3`. These project assets are provided under GPL-2.0-only to the extent of the contributors' rights. Third-party Pet Cats Pack, Tiny Kitten, and vscode-pets reference artwork is not included in the public repository or hosted application.

# License scope

The application is distributed under GPL-2.0-only (`LICENSE`). Existing per-file notices remain intact; Inter glyph assets retain SIL OFL-1.1, and bundled MIT dependencies retain their notices. KBDfans and Athena names/logos are identifiers, not a grant of trademark rights. User-imported GIFs and device backups are not part of this distribution.

# ZMK Studio protocol dependencies

ZMK protocol codecs and framing use the official ZMK Studio TypeScript client. Native behavior IDs and parameters are retained; the transport lifecycle and autosave queue are implemented by this project.

- @zmkfirmware/zmk-studio-ts-client 0.0.18 — MIT; notice: `licenses/zmkfirmware-zmk-studio-ts-client-LICENSE.txt`.
- protobufjs 7.6.6 — BSD-3-Clause; notice: `licenses/protobufjs-LICENSE.txt`.
- long 5.3.2 — Apache-2.0; notice: `licenses/long-LICENSE.txt`.
- @protobufjs/utf8 1.1.2 — BSD-3-Clause; notice: `licenses/protobufjs-utf8-LICENSE.txt`.
- @protobufjs/path 1.1.2 — BSD-3-Clause; notice: `licenses/protobufjs-path-LICENSE.txt`.
- @protobufjs/base64 1.1.2 — BSD-3-Clause; notice: `licenses/protobufjs-base64-LICENSE.txt`.
- @protobufjs/codegen 2.0.5 — BSD-3-Clause; notice: `licenses/protobufjs-codegen-LICENSE.txt`.
- @protobufjs/fetch 1.1.1 — BSD-3-Clause; notice: `licenses/protobufjs-fetch-LICENSE.txt`.
- @protobufjs/float 1.0.2 — BSD-3-Clause; notice: `licenses/protobufjs-float-LICENSE.txt`.
- @protobufjs/aspromise 1.1.2 — BSD-3-Clause; notice: `licenses/protobufjs-aspromise-LICENSE.txt`.
- @protobufjs/pool 1.1.0 — BSD-3-Clause; notice: `licenses/protobufjs-pool-LICENSE.txt`.
- @protobufjs/eventemitter 1.1.1 — BSD-3-Clause; notice: `licenses/protobufjs-eventemitter-LICENSE.txt`.

Protocol source: https://github.com/zmkfirmware/zmk-studio-ts-client (0.0.18). Build-only run-script-os is pinned to resolve its upstream postinstall dependency; it is not shipped in the browser bundle.
