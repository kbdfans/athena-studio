import { KEY_PITCH_MM, KEY_GAP_MM } from './keyboard-geometry.js';

// ANSI 87-key TKL is a function palette, independent of the connected matrix.
export const TKL_MM = Object.freeze({
  width: 18.25 * KEY_PITCH_MM - KEY_GAP_MM,
  height: 6.5 * KEY_PITCH_MM - KEY_GAP_MM,
});
const keys = [];
function row(y, items, start = 0) {
  let x = start;
  for (const item of items) {
    const [code, w = 1] = Array.isArray(item) ? item : [item];
    keys.push(Object.freeze({ code, x, y, w, h: 1 }));
    x += w;
  }
}
row(0, [41]);
row(0, [58,59,60,61], 2);
row(0, [62,63,64,65], 6.5);
row(0, [66,67,68,69], 11);
row(0, [70,71,72], 15.25);
row(1.5, [53,30,31,32,33,34,35,36,37,38,39,45,46,[42,2]]);
row(1.5, [73,74,75], 15.25);
row(2.5, [[43,1.5],20,26,8,21,23,28,24,12,18,19,47,48,[49,1.5]]);
row(2.5, [76,77,78], 15.25);
row(3.5, [[57,1.75],4,22,7,9,10,11,13,14,15,51,52,[40,2.25]]);
row(4.5, [[225,2.25],29,27,6,25,5,17,16,54,55,56,[229,2.75]]);
row(4.5, [82], 16.25);
row(5.5, [[224,1.25],[227,1.25],[226,1.25],[44,6.25],[230,1.25],[231,1.25],[101,1.25],[228,1.25]]);
row(5.5, [80,81,79], 15.25);
export const TKL_KEYS = Object.freeze(keys);
