import { parseGIF, decompressFrames } from "gifuct-js";
self.onmessage = ({ data }) => {
  try {
    const gif = parseGIF(data),
      width = gif.lsd.width,
      height = gif.lsd.height,
      count = gif.frames.filter((f) => f.image).length;
    if (
      !width ||
      !height ||
      width > 2048 ||
      height > 2048 ||
      count > 600 ||
      width * height * count > 32_000_000
    )
      throw Error(
        "GIF 较大，请先缩短至 600 帧以内，或降低分辨率（解码像素总量上限 3200 万）",
      );
    const frames = decompressFrames(gif, true),
      canvas = new OffscreenCanvas(width, height),
      ctx = canvas.getContext("2d", { willReadFrequently: true }),
      patchCanvas = new OffscreenCanvas(width, height),
      patchCtx = patchCanvas.getContext("2d");
    let previous = null,
      saved = null;
    const result = [];
    const background = gif.gct?.[gif.lsd.backgroundColorIndex] || [0, 0, 0];
    function clear(dims, transparent) {
      if (transparent)
        ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
      else {
        ctx.fillStyle = `rgb(${background.join(",")})`;
        ctx.fillRect(dims.left, dims.top, dims.width, dims.height);
      }
    }
    if (frames[0]?.transparentIndex === undefined)
      clear({ left: 0, top: 0, width, height }, false);
    for (const f of frames) {
      if (previous?.disposalType === 2)
        clear(previous.dims, previous.transparentIndex !== undefined);
      if (previous?.disposalType === 3 && saved) ctx.putImageData(saved, 0, 0);
      saved =
        f.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
      const { width: w, height: h, left, top } = f.dims;
      patchCanvas.width = w;
      patchCanvas.height = h;
      patchCtx.putImageData(new ImageData(f.patch, w, h), 0, 0);
      ctx.drawImage(patchCanvas, left, top);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      result.push({ rgba, delay: Math.max(20, f.delay || 100) });
      previous = f;
    }
    self.postMessage(
      { width, height, frames: result },
      result.map((f) => f.rgba.buffer),
    );
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
