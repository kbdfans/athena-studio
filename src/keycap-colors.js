// Classify the physical/default key, not its user-assigned function.
export function usesModifierColor(code, width = 1) {
  if (code === 44) return false; // Space follows the alphanumeric keys.
  if (code >= 58 && code <= 69) return code >= 62 && code <= 65; // F5–F8 only.
  return width > 1 || code === 41 || code === 57 ||
    (code >= 70 && code <= 82) || (code >= 224 && code <= 231) ||
    code === 0x7e04 || code === 0x7e05;
}
