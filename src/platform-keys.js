// Display names only: OS detection never changes the USB/QMK assignment.
export function detectKeyPlatform(nav = globalThis.navigator) {
  const platform = nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "";
  if (/mac|iphone|ipad|ipod/i.test(platform)) return "mac";
  if (/win/i.test(platform)) return "windows";
  return "other";
}

export function platformKeyLabel(info, platform = detectKeyPlatform()) {
  const right = info.code >= 228 ? "R" : "";
  if (info.code === 226 || info.code === 230)
    return right + (platform === "mac" ? "Option" : "Alt");
  if (info.code === 227 || info.code === 231)
    return right + (platform === "mac" ? "Cmd" : platform === "windows" ? "Win" : "Super");
  return info.label;
}

export function platformModifierLabels(platform = detectKeyPlatform()) {
  return ["Ctrl", "Shift", platformKeyLabel({ code: 226 }, platform), platformKeyLabel({ code: 227 }, platform)];
}
