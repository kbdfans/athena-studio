// Keep the physical sequence in one place for firmware upgrade and recovery.
// The keyboard illustration is schematic: the USB socket varies by enclosure.
export function bootloaderGuide() {
  return `<section class="boot-guide" aria-label="进入刷机模式的操作步骤">
    <img class="boot-guide-art" src="${import.meta.env.BASE_URL}illustrations/bootloader-esc.svg" alt="先拔掉 USB；按住左上角 Esc 再插入数据线；出现 RPI-RP2 后松开 Esc。" width="900" height="300">
    <ol class="boot-guide-steps">
      <li><strong>拔掉 USB</strong><span>先断开键盘的数据线。</span></li>
      <li><strong>按住 Esc，插入 USB</strong><span>一直按住左上角 Esc，再插入数据线。</span></li>
      <li><strong>出现 RPI-RP2 后松手</strong><span>看到升级盘后松开 Esc，保持 USB 连接。</span></li>
    </ol>
    <p class="boot-guide-note">随后在浏览器设备列表中选择 RP2 Boot；无需下载或拖拽固件文件。</p>
  </section>`;
}
