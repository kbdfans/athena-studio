import {PET_PATTERNS} from './pet-patterns.js';
export const PET_COLOR_FIELDS = [
  { key: 'body', label: '毛色' },
  { key: 'accent', label: '浅色斑纹' },
  { key: 'outline', label: '轮廓与五官' },
];
export function normalizePetColors(colors) {
  if (!colors || typeof colors !== 'object') throw Error('配色格式无效');
  return Object.fromEntries(PET_COLOR_FIELDS.map(({key}) => {
    const value = colors[key];
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw Error('请输入 # 加 6 位颜色代码');
    return [key, value.toUpperCase()];
  }));
}
export function color565(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw Error('颜色格式无效');
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) >> 3) << 11) | ((((n >> 8) & 255) >> 2) << 5) | ((n & 255) >> 3);
}
export function colorHex(c) {
  return '#' + [Math.round((c >> 11) * 255 / 31), Math.round(((c >> 5) & 63) * 255 / 63), Math.round((c & 31) * 255 / 31)].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function customPetPalette(colors) {
  const c = normalizePetColors(colors);
  return [0, color565(c.outline), color565(c.body), color565(c.accent)];
}
export const PET_COLOR_STORAGE = 'athena-pet-colors-v1';
export function readPetColors(storage, fallback, themes) {
  try {
    const saved = JSON.parse(storage?.getItem(PET_COLOR_STORAGE));
    if (!saved || ![...themes, 'custom'].includes(saved.theme)) return fallback;
    if (saved.pattern !== undefined && !Object.hasOwn(PET_PATTERNS,saved.pattern)) return fallback;
    return { theme: saved.theme, custom: normalizePetColors(saved.custom), pattern: saved.pattern || 'original' };
  } catch { return fallback; }
}
