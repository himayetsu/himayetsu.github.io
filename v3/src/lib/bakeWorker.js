// Off-main-thread hi-res planet baking. Runs the exact same pixel programs as
// the loading-screen bake, then transfers the raw RGBA buffers back — the page
// never spends a millisecond of frame budget on the bake itself.

import { createPlanetPixelFn, allocChannelBuffers, bakeRow } from './planetPixels'

/** CanvasTexture flips Y on GPU upload but DataTexture does not, so bake the
 *  flip into the buffer to keep both texture paths oriented identically. */
function flipRows(buf, w, h) {
  const row = w * 4
  const tmp = new Uint8ClampedArray(row)
  for (let y = 0; y < h >> 1; y++) {
    const a = y * row
    const b = (h - 1 - y) * row
    tmp.set(buf.subarray(a, a + row))
    buf.copyWithin(a, b, b + row)
    buf.set(tmp, b)
  }
}

self.onmessage = (e) => {
  const { id, type, seed, width, height } = e.data
  const { channels, pixelFn } = createPlanetPixelFn(type, seed)
  const buffers = allocChannelBuffers(width, height, channels)
  for (let y = 0; y < height; y++) bakeRow(width, height, y, pixelFn, buffers)

  const payload = {}
  const transfer = []
  for (const ch of channels) {
    flipRows(buffers[ch], width, height)
    payload[ch] = buffers[ch].buffer
    transfer.push(buffers[ch].buffer)
  }
  self.postMessage({ id, width, height, channels, buffers: payload }, transfer)
}
