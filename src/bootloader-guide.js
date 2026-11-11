// The USB port position is schematic and varies by model.
export function bootloaderGuide() {
  const asset = `${import.meta.env.BASE_URL}illustrations/bootloader-esc.svg`;
  return `<ol class="boot-guide-steps" aria-label="进入刷机模式的操作步骤">
    <li>
      <img class="boot-guide-art" src="${asset}#unplug" alt="" width="70" height="75">
      <div><strong>拔掉 USB</strong><span>断开键盘的数据线。</span></div>
    </li>
    <li>
      <img class="boot-guide-art" src="${asset}#hold-esc" alt="" width="70" height="75">
      <div><strong>按住 Esc，插入 USB</strong><span>插线时一直按住左上角 Esc。</span></div>
    </li>
    <li>
      <img class="boot-guide-art" src="${asset}#ready" alt="" width="70" height="75">
      <div><strong>出现 RPI-RP2 后松手</strong><span>看到升级盘后松开 Esc，保持 USB 连接。</span></div>
    </li>
  </ol>`;
}
