// Keep OUT reports ordered, but do not wait for each IN acknowledgement before
// sending the next one. A small bounded window respects the firmware's buffers.
export function hidWindow(device, packets, {
  windowSize = 4, timeout = 5000, onReply, onFatal = () => {},
} = {}) {
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 4)
    throw Error('HID 窗口大小无效');
  const iterator = packets[Symbol.iterator]();
  return new Promise((resolve, reject) => {
    const outstanding = new Map();
    let sending = false, exhausted = false, finished = false, failure;
    function finish(error, fatal = false) {
      if (finished) return;
      finished = true;
      for (const entry of outstanding.values()) clearTimeout(entry.timer);
      outstanding.clear();
      device.removeEventListener('inputreport', receive);
      if (fatal) onFatal(error);
      if (error) reject(error); else resolve();
    }
    function settle() {
      if (!sending && !outstanding.size && (exhausted || failure)) finish(failure);
    }
    function receive(event) {
      const reply = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
      if (reply.length !== 32) return;
      const entry = outstanding.get(reply[3]);
      if (!entry || !entry.packet.subarray(0, 5).every((value, i) => value === reply[i])) return;
      clearTimeout(entry.timer);
      outstanding.delete(reply[3]);
      try { onReply(reply.slice(), entry.packet); } catch (error) { failure ??= error; }
      // On a device error, drain already-sent replies before the caller aborts.
      // Never retry uncertain Flash writes or send COMMIT after an error.
      pump();
    }
    async function pump() {
      if (sending || finished) return;
      sending = true;
      try {
        while (!finished && !failure && !exhausted && outstanding.size < windowSize) {
          const next = iterator.next();
          if (next.done) { exhausted = true; break; }
          const packet = next.value;
          if (outstanding.has(packet[3])) throw Error('HID 序号冲突');
          const timer = setTimeout(() => finish(Error('连续传输超时，请重新连接键盘'), true), timeout);
          outstanding.set(packet[3], { packet, timer });
          // Await only the OUT submission, preserving packet order on every OS.
          await device.sendReport(0, packet);
        }
      } catch (error) {
        finish(error, true);
      } finally {
        sending = false;
        settle();
      }
    }
    device.addEventListener('inputreport', receive);
    pump();
  });
}
