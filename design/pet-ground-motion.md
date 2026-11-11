# Pet ground motion preview

2026-11-11: the user requested backward grass movement with different walking
and running speeds, then chose web preview only and deferred firmware upgrade.

`PetGroundMotion` in `src/pet-scene.js` accumulates integer milli-pixels:
walk = 16 LCD pixels/second; run = 48 pixels/second; all other actions and the
egg stage = stationary. The phase persists across action and species changes.
Grass tufts wrap over a 128-pixel strip with edge fragments continuing at the
opposite edge. Sky, clouds, ground horizon, LV/HP overlays and pet position do
not scroll. The existing jump lift is preserved. Hidden-tab gaps over 250 ms
are treated as pauses, and reduced-motion mode keeps the ground still.

The web animation supplies this phase to `petPreview`. Tests verify the 3:1
speed ratio, no reset when stopping, wraparound, uint32 clock wrap and static
sky. The native scanline parity test also checks the same stateful phase against
`firmware/v2/src/pet_render.c` and generated `pet_scene.h`. Firmware redraw
invalidation includes ground offset, so a future firmware build can update the
ground between sprite frame changes without a new framebuffer.

**Release boundary:** this release updates the website and prepares shared C
source only. No UF2 was built, no device was flashed, and `releases.json` plus
all offered firmware files/source archives remain unchanged. Existing keyboard
firmware still has static grass; uploading a cat/dog appearance cannot change
that background. The preview states this explicitly. A future firmware release
must apply the shared renderer to each model's verified source without changing
its screen initialization, then compile, inspect and validate on hardware.
