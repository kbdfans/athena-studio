# Original mint cat v1 — animation design preview

Approved direction: original mint-green quadruped kitten, cream muzzle and belly,
chunky curved tail. Concept approved by the user on 2026-11-09.
Generated with the built-in Imagegen tool, then serialized for a small-screen preview.

Files:
- approved-concept.png: user-approved concept board.
- transparent-source.png: generated clean atlas before packing.
- frame-00.png through frame-19.png: normalized 40x32 indexed-color frames.
- frames-40x32.2bpp: 20 frames, 320 bytes/frame, exactly 6400 bytes.
- preview-data.json: palette, pixel indices and extraction bounds.
- compile-preview.py: reproducible atlas extraction and 2-bit packing.
- contact-sheet.png: all normalized frames for review.

Three opaque colors plus transparency; RGB/RGBA palette and timing are separate.
This raw pixel stream is NOT a valid PT32 firmware upload file. Existing firmware
expects 32x32 and four frames per action. Firmware integration is still pending.
No device or firmware sources were changed by this design stage.

The browser preview uses eight run poses and eight jump poses. Jump height is
controlled separately from the drawn pose. Idle and sleep currently use static
key poses; these do not yet include bespoke blink/breathing animation frames.
Frame packing was decoded and compared pixel-for-pixel; browser playback,
single jump completion and manual stepping were checked.

## Final image-edit prompt

Edit target: the supplied approved ORIGINAL mint-green pixel kitten motion board.
Turn it into a clean transparent animation sprite atlas while preserving this exact
kitten design and all twenty poses in the same reading order. Keep the face, ear
shapes, cream muzzle, cream belly, mint fur, dark teal outlines, chunky curved tail,
four-legged anatomy and personality unchanged. Remove ALL text, numbers, ground
lines, background, shadows, alert punctuation and sleeping Z symbols. Actual
transparent alpha background, not a checkerboard. A perfectly regular FOUR COLUMN
by FIVE ROW grid, each cell identical size. Each cell contains exactly one complete
cat, centered horizontally, with generous transparent margins. No gutters drawn.
Make the scale of the head and torso consistent across all twenty cells; all
standing/grounded paws align to the SAME local baseline within each cell.
Crucially do NOT bake the big jump trajectory into the sprite position: the engine
will supply the jump height. Keep airborne poses registered to a consistent body
anchor rather than randomly moving within cells. Rows 2+3 retain the eight gallop
poses from reference; rows 4+5 retain the eight jump poses including crouch, hind
push, tucked paws, forepaw reach and landing crouch. Use hard square pixel clusters
on one consistent pixel grid, approximately native 40x32 pixel character detail per
cell, enlarged cleanly. Exactly FOUR opaque flat colors only: dark teal
outline/shadow, mid mint green fur, light mint highlight, pale cream muzzle/belly.
No gradients, no blur, no glow, no texture, no decorative elements. Frame
consistency is more important than adding detail. Preserve the reference
silhouette and approved natural motion. Production-oriented atlas, transparent
outside the cats.

## Processing notes

Generated positions were measured by row/cell bounds instead of assuming a perfect
grid. A common 1/7 scale was applied, with a 40x32 cell and common bottom baseline.
The preview reduces generated highlights to one mint shade for three opaque colors.
This is a first animation preview, not a claim of final frame-perfect hand pixel art.
