export const NUMPAD_KEYS = [
  [83, 0, 0], [84, 1, 0], [85, 2, 0], [86, 3, 0],
  [95, 0, 1], [96, 1, 1], [97, 2, 1], [87, 3, 1, 1, 2],
  [92, 0, 2], [93, 1, 2], [94, 2, 2],
  [89, 0, 3], [90, 1, 3], [91, 2, 3], [88, 3, 3, 1, 2],
  [98, 0, 4, 2], [99, 2, 4],
];

export function decorateFunctionKey(button, label, description = label) {
  const legend = document.createElement('span');
  legend.className = 'palette-legend';
  legend.textContent = label
    .replace(/^(?:International|国际键?)\s+(\d+)$/i, 'Intl $1')
    .replace(/^(?:Language|语言)\s+(\d+)$/i, 'Lang $1');
  button.type = 'button';
  button.classList.add('palette-key');
  button.replaceChildren(legend);
  button.setAttribute('aria-label', label);
  button.title = description;
  return button;
}
