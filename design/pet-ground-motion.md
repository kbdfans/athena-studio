# Pet ground motion preview

2026-11-11: the user requested backward grass movement with different walking
and running speeds, then chose web preview only and deferred firmware upgrade.

`PetGroundMotion` in `src/pet-scene.js` accumulates integer milli-pixels:
walk = 16 LCD pixels/second; run = 48 pixels/second. Jumps inherit the current
speed (standing jumps use walking speed); other actions and the egg stage stop. The phase persists across action and species changes.
Grass tufts wrap over a 128-pixel strip with edge fragments continuing at the
opposite edge. Sky, clouds, ground horizon, LV/HP overlays and pet position do
not scroll. The airborne jump path is preserved. Hidden-tab gaps over 250 ms
are treated as pauses, and reduced-motion mode keeps the ground still.

The web animation supplies this phase to `petPreview`. Tests verify the 3:1
speed ratio, no reset when stopping, wraparound, uint32 clock wrap and static
sky. The native scanline parity test also checks the same stateful phase against
`firmware/v2/src/pet_render.c` and generated `pet_scene.h`. Firmware redraw
invalidation includes ground offset, so a future firmware build can update the
ground between sprite frame changes without a new framebuffer.

## Jump continuity (web preview)

Walking/running jumps use 80 ms anticipation, the original 410 ms airborne
path, and 90 ms landing recovery, instead of the original 1050 ms one-shot.
The initial lift blends from the preceding running pose; the next running
cycle starts on its grounded footfall. Running hysteresis survives the jump,
and input during flight updates activity without restarting the animation.
Stationary jumps retain the original full hop. This avoids the old jump
outlasting the 900 ms typing inactivity threshold and landing abruptly idle.
The preview's action buttons and typing area share this transition behavior;
clicking the typing area again no longer resets an ongoing jump.

Ground inheritance is mirrored in the generated C scene. The shortened motion
controller is web-only at this stage and still needs porting to `pet.c` before
any future firmware release. The published firmware and source archives do
not contain these preview changes.

**Release boundary:** this release updates the website and prepares shared C
source only. No UF2 was built, no device was flashed, and `releases.json` plus
all offered firmware files/source archives remain unchanged. Existing keyboard
firmware still has static grass; uploading a cat/dog appearance cannot change
that background. The preview states this explicitly. A future firmware release
must apply the shared renderer to each model's verified source without changing
its screen initialization, then compile, inspect and validate on hardware.
