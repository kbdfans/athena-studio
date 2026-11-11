export const PHYSICAL_LAYOUT_MASK = 0x1e0;
export function withLayoutChoice(options, group, choice) {
  if (!Number.isInteger(options) || options < 0 || options > 0xffffffff ||
      !Number.isInteger(group) || group < 0 || group > 3 || ![0,1].includes(choice))
    throw Error("布局选项无效");
  const bit = 1 << (8 - group);
  return ((options & ~bit) | (choice ? bit : 0)) >>> 0;
}

// Physical positions come from Athena75's upstream Vial KLE definition.
// Layout option labels are packed from last to first (VIA specification).
export function layoutChoices(labels, options) {
  let shift = 0;
  const choices = [];
  for (let i = labels.length - 1; i >= 0; i--) {
    const bits =
      typeof labels[i] === "string"
        ? 1
        : Math.ceil(Math.log2(labels[i].length - 1));
    choices[i] = (options >>> shift) & ((1 << bits) - 1);
    shift += bits;
  }
  return choices;
}
export function keyboardLayout(definition, options = 10, model = "athena75") {
  const keys = [];
  let y = 0;
  for (const row of definition.layouts.keymap) {
    let x = 0,
      p = {};
    for (const item of row) {
      if (typeof item === "object") {
        x += item.x || 0;
        y += item.y || 0;
        p = { ...p, ...item };
        continue;
      }
      const fields = item.split("\n"),
        matrix = /^(\d+),(\d+)$/.exec(fields[0]),
        group = /^(\d+),(\d+)$/.exec(fields[3] || "");
      if (matrix && !p.d)
        keys.push({
          row: +matrix[1],
          col: +matrix[2],
          x,
          y,
          w: p.w || 1,
          h: p.h || 1,
          x2: p.x2 || 0,
          w2: p.w2 || p.w || 1,
          h2: p.h2 || p.h || 1,
          group: group ? +group[1] : null,
          choice: group ? +group[2] : null,
        });
      x += p.w || 1;
      p = {};
    }
    y++;
  }
  const choices = layoutChoices(definition.layouts.labels, options);
  const selected = keys
    .filter((k) => k.group === null || choices[k.group] === k.choice)
    .map((k) => ({ ...k }));
  for (let g = 0; g < (model==="athena75"?4:3); g++) {
    if (!choices[g]) continue;
    const base = keys.filter((k) => k.group === g && k.choice === 0),
      alt = selected.filter((k) => k.group === g);
    if (!alt.length) continue;
    const left = (ks) => Math.min(...ks.map((k) => k.x + Math.min(0, k.x2))),
      top = (ks) => Math.min(...ks.map((k) => k.y));
    const dx = left(base) - left(alt),
      dy = top(base) - top(alt);
    for (const k of alt) {
      k.x += dx;
      k.y += dy;
    }
  }
  if(model!=="athena75"){const left=Math.min(...selected.map(k=>k.x+Math.min(0,k.x2)));for(const k of selected)k.x-=left;return selected;}
  // Keep upstream matrix/option identities, but use the supplied enclosure
  // reference for visual placement: a 16U board and equally spaced F groups.
  for (const k of selected) {
    k.x -= 2.5;
    if (k.y === 0) {
      if (k.x >= 1.25 && k.x <= 4.25) k.x -= 0.05;
      else if (k.x >= 5.5 && k.x <= 8.5) k.x -= 0.1;
      else if (k.x >= 9.75 && k.x <= 12.75) k.x -= 0.15;
    }
    // Navigation column directly follows the 15U typing block. The arrows
    // retain their original inverted-T positions (13U, 14U, 15U).
    if (k.x === 15.25) k.x = 15;
    if (k.row === 8 && k.col === 2) {
      // Horizontal pill centred in the auxiliary-button position.
      k.x = 15.0625; k.y = 4.5;
      k.w = k.w2 = 0.875; k.h = k.h2 = 0.5;
    }
  }
  return selected;
}
