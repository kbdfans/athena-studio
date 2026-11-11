# Shiba Inu companion

2026-11-11. Original Shiba companion matching the project's mint-cat pixel style.
The reference is the original `design/mint-cat-v3/idle-source.png`; no external
pet sprites are copied. Generated with the built-in imagegen tool, not API/CLI.
The exact prompt is in `generation-prompt.txt`, and the retained generated atlas
is `source.png`. `compile.py` extracts its 8×6 grid, aligns the floor, applies a
common nearest-neighbour scale and the original orange three-color palette,
then encodes `src/pet-shiba-art.js`. Run `python3 design/shiba-v1/compile.py`
with Pillow installed to reproduce the resource.

The 44-frame 40×32 2bpp resource uses the existing eight PT40 actions: seated
idle, walk, run, sleep, eat, happy, jump and wake. It reuses the original frame
sequence IDs, timing, runtime jump lift, grass scene and floating sleep letters.
Total pack size remains 14,336 bytes. No firmware or save-format change is made.
The screen renderer parity test covers all Shiba action frames and life stages.
The dog remains a preview until the user uploads its appearance through the
existing pet partition writer/readback flow. Cat and dog replace the same pet
appearance and share growth progress; this is not two independent save slots.
Existing cat sprite bytes, keyboard keymap and image partitions are unchanged.

Cat and Shiba selection and color preferences are saved separately in the browser.
Default Shiba palette is orange/cream/dark brown; users can recolor or choose
existing fur patterns. Browser checks cover all eight previews, species/color
persistence, returning to the original cat settings, English UI and disabled
writes in demo mode. On 2026-11-11, the user confirmed the Shiba appearance and motions displayed
correctly on the keyboard after uploading from kbd.cool. The reply did not
specify which Athena model, so this is not recorded as separate acceptance for
both models.

Project-created artwork is provided under GPL-2.0-only to the extent of the
contributors' rights, as described in THIRD_PARTY.md.
