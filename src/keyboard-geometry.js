// Millimetre model chosen for the Athena preview: 18 mm caps on a 19 mm pitch.
// KLE coordinates describe pitch units, including deliberate gaps between groups.
export const KEY_PITCH_MM = 19;
export const KEY_GAP_MM = 1;
export const KEYBOARD_MM = Object.freeze({
  width: 16 * KEY_PITCH_MM - KEY_GAP_MM,
  height: 6.25 * KEY_PITCH_MM - KEY_GAP_MM,
});
export const KEYBOARD_ASPECT_RATIO = `${KEYBOARD_MM.width} / ${KEYBOARD_MM.height}`;
export const SCREEN_POSITION = Object.freeze({ x: 13.8, y: 0, w: 1, h: 1 });

export function keycapRectMm(key) {
  const left = Math.min(0, key.x2 || 0);
  const right = Math.max(key.w, (key.x2 || 0) + (key.w2 || key.w));
  return {
    x: (key.x + left) * KEY_PITCH_MM,
    y: key.y * KEY_PITCH_MM,
    width: (right - left) * KEY_PITCH_MM - KEY_GAP_MM,
    height: key.h * KEY_PITCH_MM - KEY_GAP_MM,
  };
}

export function keycapStyle(key, board = KEYBOARD_MM) {
  const rect = keycapRectMm(key);
  let style = `left:${rect.x / board.width * 100}%;top:${rect.y / board.height * 100}%;width:${rect.width / board.width * 100}%;height:${rect.height / board.height * 100}%;`;
  // ISO Enter has a wider top and a narrow lower stem. Derive the notch from
  // the same physical model so its neighbours retain the one-millimetre gap.
  if (key.h > 1 && key.x2 < 0) {
    const notchX = -key.x2 * KEY_PITCH_MM / rect.width * 100;
    const notchY = (key.h2 * KEY_PITCH_MM - KEY_GAP_MM) / rect.height * 100;
    style += `clip-path:polygon(0 0,100% 0,100% 100%,${notchX}% 100%,${notchX}% ${notchY}%,0 ${notchY}%);`;
  }
  return style;
}
