# KBD Studio

## Public deployment and source (2026-11-11)

- China: https://kbd.cool/studio/
- International: https://v.kbd.cool/studio/
- Public source: https://github.com/kbdfans/athena-studio (GPL-2.0-only, with third-party notices)
- Hosted build: `npm run build:hosted`. Serve `dist/` at `/studio/`. The integrated configurator is the default hosted index.
- Athena1800 has now passed initial hardware screen/pet/typing checks. Athena75 intermittent black-screen diagnosis remains unresolved; the latest user report was recovery after restarting the Mac. Historical notes below are development history, not current release guarantees.
- Deployment evidence and private rollback material: `.artifacts/deploy-20261111/`. Public repository is an allowlisted source export; device backups, unrelated sites, credentials and third-party reference artwork are excluded.


## 当前网站适配（2026-11-10）

入口 `http://127.0.0.1:8770/studio-v2.html`。未连接时只显示连接入口和语言选择；设备身份确认且键位读取完成才显示工作区。断开连接返回入口。改键、检测、屏幕弹窗共用连接。

- **Athena75**：保留已实测的 11×8、8 层改键、检测及 Screen Studio 屏幕功能。
- **Athena75 RGB**：使用上游 Vial 定义（USB `9d5b:2514`），支持 8 层改键、矩阵检测、键位导入导出和灯光快捷键。支持范围为键位配置，Screen Studio 和在线升级需该型号专用固件。
- **Athena1800**：按官方 Vial 定义接入 14×8、8 层布局、即时改键和矩阵检测。只有模拟协议和布局测试，尚无实机验收。物理布局按设备读取展示，布局选项写入暂不开放。图片上传、宠物、打字弹球未适配，入口隐藏，不发送 Athena75 屏幕协议。
- 型号由 VID/PID + Vial UID 联合识别；Athena 系列的这些型号上游共用 UID。键位和高级设置备份按型号隔离，禁止跨型号导入。
- 语言：简体中文、繁体中文、英语、日语、韩语、德语、法语、西班牙语；记住选择，切换不重建 USB 会话。核心导航、分类、按钮已翻译，部分技术说明回退英文，未收录文本保留原文。语言表 `src/locales/ui.txt` / `help-en.txt`，修改后运行 `node scripts/build-locales.mjs`。
- 基础分类新增「屏幕快捷键」。独立动画 / 宠物 / 弹球键使用 `0x7e10` / `0x7e11` / `0x7e12`，要求 Athena75 能力版本 9；旧固件会阻止分配并提示升级。新固件已打包于 `firmware/v2/build/typing-r3`，**尚未安装**。不占用 Athena1800 原有 `0x7e06` LCD 类型功能。

型号来源和限制见 [适配说明](design/device-support.md)。下方历史记录描述各阶段实现，以本节和 VALIDATION.md 最新记录为准。

当前入口 `/studio-v2.html` 已整合 **键位配置、图片动画和像素宠物**。连接后读取 8 层实际键位；先点上方目标键，再点下方按键功能，连接时点击即应用，无需保存。点击键盘右上角的小屏幕进入图片 / 宠物设置。顶部「键盘测试」可只读检测物理按键，按下橙色、测过绿色，支持多键同时按下、计数、清空与暂停。默认物理模式需要连接 Athena75；不再自动降级。浏览器模式需手动选择，无法检测 Fn/屏幕键，未支持的两个位置标为虚线且不计入 79 键覆盖率。Mac 系统快捷键仍可能被系统处理，现有固件无隔离输入接口。提示音提供电子滴答、复古 8-bit、柔和水滴和关闭，支持试听、音量及本地偏好保存。进入测试页自动检测，连接成功后自动继续；可用 `studio-v2.html#test` 直接打开。物理模式失焦后最多保留 200ms 采样窗口再暂停，返回前台自动继续；手动暂停保留控制权。不解锁安全设置、不修改键位。连接弹窗已移除旧版图片工具入口。1366×768 和 1280×720 使用紧凑布局：层在上方、分类在左侧、双键盘与同步状态同屏。

改键复用已安装固件的 VIA 协议 12，不需要刷机。只写有差异的按键，写入前检查冲突并在浏览器备份，逐键及全量回读；测试后已独立核对 704 个键码恢复原值。键位文件可导入导出，连接时导入即应用；离线导入仅预览，连接后读取键盘现有配置，不自动上传离线修改；宏、组合键、物理布局设置不在此次编辑范围。浏览器备份存储失败会阻止写入，清除站点数据会清除备份，建议从“键位文件”下载留存。


Athena75 的本地屏幕动画编辑器：导入 GIF / PNG / JPG / 静态 WebP，裁剪到 128 × 128，截取帧范围，按动画位置容量减少帧数，预览 RGB565 颜色，再通过 WebHID 正常模式直传或 WebUSB 升级模式写入键盘。图片不上传服务器。

2026-11-09 已在测试 Athena75 上通过 Screen Studio v1 r3 正常模式网页上传、自动备份和独立逐字节回读校验；用户确认动画播放正常、拔插后仍保留、键盘能正常打字。详细范围见 [验证记录](VALIDATION.md)。

## 运行

电子宠物新版入口：`http://127.0.0.1:8770/studio-v2.html`，包含三个图片位置和独立像素宠物，需配套 v2 固件及资源迁移；旧入口 `/` 仍用于已验收的 v1。详见 [v2 固件说明](firmware/v2/README.md)。

当前实机验收版本为 **v2 动作优化 r5**（2026-11-09）：草地、LV / HP、坐姿摇头摆尾、睡眠 z 已由用户确认。固件和验收记录位于 `firmware/v2/build/motion-r5/`。本次改键与网页改版未更新固件。

```sh
npm ci
npm run dev
```

用桌面 Chrome / Edge 打开 http://127.0.0.1:8770/studio-v2.html 使用当前宠物版；旧 v1 固件使用根路径 `/`。`npm test` 运行格式与写入边界测试，`npm run build` 输出静态站点到 `dist/`。正式在线使用需 HTTPS；当前为本地预览，未部署公网。

## 使用

1. 导入素材，拖动裁剪画面、调整缩放和起止帧。选择动画位置，工具会自动适配容量，合并重复帧并保留选中片段的总时长。
2. 点击“连接正常模式键盘”。安装 Screen Studio v1 固件后可直接上传，无需组合键或升级 U 盘；原固件仍保留左 Shift + 右 Shift + 左 Ctrl + B → RP2 Boot 的兼容路径。首次启用直传需要升级一次固件，详见 [固件说明](firmware/README.md)。
3. 预览后写入。工具先读取所选位置的完整内容，保存到当前浏览器的 IndexedDB，并读取备份进行 SHA-256 校验；成功后才擦除与写入。升级模式逐字节回读比对后重启；正常模式由固件逐页回读比较并核验完整 CRC32，成功后提交资源头并重新加载动画，不重启键盘。
4. 在键盘上切换动画，确认颜色、方向、速度及断电后保留情况。电脑校验成功不能替代实际屏幕观察。

“动画备份与恢复”可导出原内容的 UF2，也可在重新连接支持的键盘后恢复。浏览器备份按站点地址和浏览器配置隔离，清除站点数据会清除备份；建议下载保留。恢复前也会备份当前内容。

正常模式连接后可用“重新初始化屏幕”重试屏幕初始化，不覆盖动画。完整位置备份通过 HID 读取，可能需要数分钟；上传过程中屏幕播放会暂停，Flash 擦写期间可能有短暂输入停顿。

“下载 UF2”是手动传输途径：将文件复制到键盘的 RPI-RP2 升级盘。此途径不经过网页的自动备份及回读流程。

## 旧版 v1 的硬件与资源布局（根路径入口）

- 测试键盘：Athena75 Keybaord (VIAL_DQ5I)，USB 9d5b:2513，Vial UID `2ee60e2334ef9937`。
- 正常模式扩展固件：Athena75 Screen Studio v1，VID/PID 与 Vial UID 保持原值，通过 `FD A7` 协议探测能力；不能只凭设备名称判断兼容。
- 升级接口：RP2040 PICOBOOT，USB 2e8a:0003；WebUSB 批量传输，进入 Flash 读取前退出 XIP。
- RGB565 像素采用大端序；QGF 头、帧偏移和时长为小端序。UF2 family 为 `e48bff56`。

| 位置  | 用途       | 起始地址   | 容量  | 最大帧数 |
| ----- | ---------- | ---------- | ----- | -------- |
| GIF 0 | 大写锁定   | 0x10400000 | 1 MiB | 31       |
| GIF 1 | 打字动画   | 0x10500000 | 1 MiB | 31       |
| GIF 2 | 日常动画 1 | 0x10600000 | 2 MiB | 63       |
| GIF 3 | 日常动画 2 | 0x10800000 | 2 MiB | 63       |
| GIF 4 | 日常动画 3 | 0x10a00000 | 2 MiB | 63       |
| GIF 5 | 日常动画 4 | 0x10c00000 | 2 MiB | 63       |

写入只允许上述目标区域，4 KiB 擦除、256 字节写入，不写主固件。连接时检查六个位置的资源头。此版本仅支持上述实测固件身份和资源布局，不能据此宣称支持其他 Athena75 固件或所有 RP2040 键盘。

## 素材限制

文件上限 20 MiB。GIF 单边不超过 2048 像素、最多 600 帧，总解码像素不超过 3200 万；静态图单边不超过 4096 像素。GIF 在 Worker 中解析，处理透明及 disposal 2 / 3。透明区域合成在深色背景上。优化通过抽帧和合并重复帧降低设备资源占用，输出为设备可播放的 QGF / UF2，不导出压缩 GIF。

## 源码

- `src/format.js`：资源格式、容量限制、帧优化。
- `src/gif-worker.js`：GIF 解码与帧合成。
- `src/device.js`：WebHID 身份识别、PICOBOOT 读写、校验。
- `src/runtime-hid.js`：正常模式传输、能力探测与设备内回读校验结果确认。
- `firmware/`：固定版本上游的固件扩展、可复现应用脚本及原生协议测试。
- `src/backup.js`：浏览器持久备份与摘要校验。
- `src/main.js`：编辑器、预览、连接、写入与恢复流程。

参考：[用户提供的开源分支](https://github.com/yangdigi/vial-qmk-v5/tree/ava/keyboards/ydkb)、[原版 Athena 转换工具](https://openkbd.github.io/tools/athena/)、[Raspberry Pi picotool](https://github.com/raspberrypi/picotool)。最初提供的 v5 目录中未找到 Athena75 实现，后续已在 [openkbd/vial-qmk-v6](https://github.com/openkbd/vial-qmk-v6/tree/ava/keyboards/ydkb/athena75) 找到对应源码；UID、屏幕实现和动画地址均已核对，正常模式扩展基于该源码开发。

界面方向来自 Superdesign：[设计草稿](https://p.superdesign.dev/draft/1b2c71ef-0c6e-49ff-a30f-b26fb9acea0a)，本地参考文件在 `.superdesign/`。实际交付以本仓库功能页面为准。

### 基础 / 高级键位配置

默认进入基础模式，显示基础按键、数字小键盘、修饰键、导航键、媒体控制、常用层切换、鼠标按键。数字小键盘按实体布局排列。高级模式分成组合与自动化、扩展键码、行为设置；提供完整当前固件键码目录及组合快捷键、LT/MT、宏、Tap Dance、Combo、Key Override 和 QMK 参数。模式切换只改变列表，不改动已有键位。

普通键位点击即应用。高级规则先「读取配置」，完成一条规则后「应用此条规则」，自动备份并回读；宏和 Tap Dance 还需要将相应 M/TD 编号赋予实体键。宏支持 US ASCII 文本、按下／释放、轻按与延迟；中文文本不能直接作为文字宏。容量从实机读取，不在网页中虚构。灯光键码仅对键盘实际安装的灯光硬件有作用。音频、MIDI、Unicode 等未编译的引擎不作为可用功能提供。

「导出全部高级配置」保存高级区快照（与普通键位文件分开）；「导出最近自动备份 / 恢复单项备份」用于恢复某一次高级写入。宏在完整写入和回读完成前暂停播放，断线后可重连并恢复写入前备份。

### 基础布局设置

“基础 → 布局设置”支持 ISO Enter、分裂左 Shift 和6.25U/7U底排；连接并读取键盘后即时应用，写入前备份并回读。7U底排为1.5U＋1U＋1.5U＋7U＋1.5U。下方基础选键区独立使用87键TKL布局。

分裂Backspace目前仅支持离线预览：现有固件的VIA布局存储只有1字节，而此选项位于第9位。网站已阻止这一位的无效写入；要随键盘保存需先适配固件存储和迁移，不能直接增大EEPROM字段导致后续键位数据偏移。
