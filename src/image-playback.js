import { inspectQgf, qgfSize, slotAt } from './format-v2.js';

export async function playStoredImage(device, slot, wait = ms => new Promise(r => setTimeout(r,ms))) {
  const position = slotAt(slot);
  if (!device || device.broken || !device.device?.opened) throw Error('请先连接键盘');
  // Allow an already-running status poll to finish before taking the transport.
  for (let i=0;device.pending && i<275;i++) await wait(20);
  if (device.pending || device.broken || !device.device.opened) throw Error('键盘连接暂不可用，请重试或重新连接');
  const header = inspectQgf(await device.read(slot,position.address,256),slot);
  if (header?.empty) throw Error(`图片 ${slot+1} 还没有动画，请先点击“写入键盘”`);
  if (!header || header.size !== qgfSize(header.frames)) throw Error(`图片 ${slot+1} 的动画数据无效，请重新写入`);
  if ((await device.info(slot)).lcdOff) throw Error('键盘屏幕当前已关闭，请按左右 Shift + O 打开屏幕后重试');
  const before = await device.petCommand();
  await device.petCommand(20,slot);
  const status = await device.petCommand();
  if (!status.ready || status.mode !== 0 || status.image !== slot)
    throw Error('键盘未确认切换到所选图片，请重试');
  // Acknowledgement confirms selection, but only the display core knows whether
  // it loaded the image. Phase 5 means image playback; phase 6 means No image.
  for (let i=0;i<20;i++) {
    await wait(50);
    const info = await device.info(slot);
    if (info.lcdOff) throw Error('屏幕已关闭，请打开屏幕后重试');
    if (info.phase === 5) return {status,frames:header.frames,alreadySelected:before.mode===0 && before.image===slot};
    if (info.phase === 6 || info.phase === 250) throw Error('键盘已接收切换指令，但屏幕未能加载图片，请重新写入或检查屏幕');
  }
  throw Error('键盘已接收切换指令，但尚未确认屏幕播放，请检查键盘画面');
}
