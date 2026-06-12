// CPU procedural texture baking (main-thread canvas path).
//
// Every planet surface is baked from its seed into seamless equirectangular
// PBR maps (albedo / bump / roughness / emissive) by sampling seeded 3D
// simplex noise on the unit sphere. Baking is chunked row-by-row and yields to
// the event loop, which is what drives the *real* progress bar on the loading
// screen — no fake timers. The per-type pixel programs live in planetPixels.js
// so the hi-res background worker (bakeWorker.js) shares them.

import * as THREE from 'three'
import { createNoise3D } from './noise'
import { createRng } from './prng'
import {
  createPlanetPixelFn,
  allocChannelBuffers,
  bakeRow,
  PLANET_TEXTURE_KEYS,
  clamp01,
  smoothstep,
  ramp,
  hsl,
} from './planetPixels'

export const PLANET_TEX_W = 768
export const PLANET_TEX_H = 384
const MOON_TEX_W = 512
const MOON_TEX_H = 256

const nextTick = () => new Promise((r) => setTimeout(r, 0))

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function toTexture(canvas, { srgb = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  return tex
}

/**
 * Generic equirectangular sphere baker (chunked + canvas output).
 * pixelFn(nx, ny, nz, lat01) returns { color:[r,g,b], bump:0-1, rough:0-1, emissive?:[r,g,b], cloud?:0-1 }
 */
async function bakeSphere(w, h, pixelFn, channels, onProgress) {
  // keep each chunk to ~18k pixels so the loading screen stays responsive
  const rowsPerChunk = Math.max(4, Math.round(18432 / w))
  const buffers = allocChannelBuffers(w, h, channels)

  for (let y = 0; y < h; y++) {
    bakeRow(w, h, y, pixelFn, buffers)
    if (y % rowsPerChunk === rowsPerChunk - 1) {
      onProgress?.((y + 1) / h)
      await nextTick()
    }
  }

  const result = {}
  for (const ch of channels) {
    const canvas = makeCanvas(w, h)
    canvas.getContext('2d').putImageData(new ImageData(buffers[ch], w, h), 0, 0)
    result[ch] = canvas
  }
  onProgress?.(1)
  return result
}

// ---------------------------------------------------------------------------
// Planet types (pixel programs shared with the worker via planetPixels.js)
// ---------------------------------------------------------------------------

async function bakePlanetType(type, seed, onProgress, opts = {}) {
  const W = opts.width ?? PLANET_TEX_W
  const H = opts.height ?? PLANET_TEX_H
  const { channels, pixelFn } = createPlanetPixelFn(type, seed)
  const maps = await bakeSphere(W, H, pixelFn, channels, onProgress)
  const out = {}
  for (const ch of channels) {
    const [key, srgb] = PLANET_TEXTURE_KEYS[ch]
    out[key] = toTexture(maps[ch], { srgb })
  }
  return out
}

export const bakeHotPlanet = (seed, onProgress, opts) => bakePlanetType('hot', seed, onProgress, opts)
export const bakeHabitablePlanet = (seed, onProgress, opts) => bakePlanetType('habitable', seed, onProgress, opts)
export const bakeIcePlanet = (seed, onProgress, opts) => bakePlanetType('ice', seed, onProgress, opts)
export const bakeExoticPlanet = (seed, onProgress, opts) => bakePlanetType('exotic', seed, onProgress, opts)

// ---------------------------------------------------------------------------
// Moons / rings / background sprites
// ---------------------------------------------------------------------------

/**
 * Cratered rocky moon. Each variant gets seeded terrain/crater structure; the
 * baked albedo stays near-neutral so a per-moon hue tint (applied on the
 * material) gives every moon its own identity for free.
 */
export async function bakeMoon(seed, onProgress) {
  const { fbm, ridged } = createNoise3D(seed)
  const rng = createRng(seed + ':palette')
  const tint = rng.pick([
    [186, 180, 172],
    [170, 162, 150],
    [162, 158, 168],
    [190, 176, 154],
  ])
  const terrainScale = rng.range(2.2, 4.4)
  const craterScale = rng.range(4.0, 8.0)
  const craterThresh = rng.range(0.55, 0.7)

  const maps = await bakeSphere(
    MOON_TEX_W, MOON_TEX_H,
    (x, y, z) => {
      const e = fbm(x * terrainScale, y * terrainScale, z * terrainScale, 4)
      const craters = ridged(x * craterScale, y * craterScale, z * craterScale, 3)
      const pit = smoothstep(craterThresh, craterThresh + 0.3, craters)
      const v = clamp01(0.6 + e * 0.3 - pit * 0.28)
      return {
        color: [tint[0] * v, tint[1] * v, tint[2] * v],
        bump: clamp01(0.5 + e * 0.35 - pit * 0.4),
        rough: 0.95,
      }
    },
    ['color', 'bump', 'rough'],
    onProgress
  )

  return {
    map: toTexture(maps.color, { srgb: true }),
    bumpMap: toTexture(maps.bump),
    roughnessMap: toTexture(maps.rough),
  }
}

/** Square texture of concentric translucent ring bands (planar-mapped) */
export function bakeRingTexture(seed) {
  const size = 512
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const { fbm } = createNoise3D(seed + ':rings')
  const rng = createRng(seed + ':ringpalette')
  const ringHue = rng.range(25, 260)
  const tintA = hsl(ringHue, rng.range(0.1, 0.25), rng.range(0.82, 0.9))
  const tintB = hsl(ringHue + rng.range(-15, 15), rng.range(0.2, 0.35), rng.range(0.58, 0.7))
  const half = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const d = Math.sqrt(dx * dx + dy * dy)
      const idx = (y * size + x) * 4
      if (d < 0.46 || d > 1.0) {
        img.data[idx + 3] = 0
        continue
      }
      const t = (d - 0.46) / 0.54
      const bands = fbm(t * 11.0, 3.7, 9.1, 4) * 0.5 + 0.5
      const fine = fbm(t * 64.0, 8.2, 1.3, 2) * 0.5 + 0.5
      const edgeFade = smoothstep(0, 0.06, t) * (1 - smoothstep(0.88, 1, t))
      const alpha = clamp01((bands * 0.7 + fine * 0.3) * edgeFade)
      const c = ramp([[0, tintB], [1, tintA]], bands)
      img.data[idx] = c[0]
      img.data[idx + 1] = c[1]
      img.data[idx + 2] = c[2]
      img.data[idx + 3] = Math.round(alpha * 215)
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = toTexture(canvas, { srgb: true })
  tex.wrapS = THREE.ClampToEdgeWrapping
  return tex
}

/** Soft volumetric-looking nebula sprite */
export function bakeNebulaTexture(seed, colorA, colorB) {
  const size = 256
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const { fbm } = createNoise3D(seed)
  const half = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const d = Math.sqrt(dx * dx + dy * dy)
      const falloff = clamp01(1 - d)
      const n = fbm(dx * 2.4, dy * 2.4, 7.7, 5) * 0.5 + 0.5
      const m = fbm(dx * 5.0 + 3.3, dy * 5.0, 1.2, 3) * 0.5 + 0.5
      const density = clamp01(smoothstep(0.32, 0.85, n) * falloff * falloff * (0.6 + m * 0.55))
      const c = ramp([[0, colorA], [1, colorB]], m)
      const idx = (y * size + x) * 4
      img.data[idx] = c[0]
      img.data[idx + 1] = c[1]
      img.data[idx + 2] = c[2]
      img.data[idx + 3] = Math.round(density * 190)
    }
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(canvas, { srgb: true })
}

/**
 * Radial glow sprite (sun corona, lens flares, star glints) with a smooth
 * gaussian falloff — no gradient stops, so no visible "rendered circle" rings.
 */
export function bakeGlowTexture(rgb = [255, 255, 255], size = 256) {
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const half = size / 2
  const k = 6
  const floorA = Math.exp(-k)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy))
      const a = (Math.exp(-k * d * d) - floorA) / (1 - floorA)
      const idx = (y * size + x) * 4
      img.data[idx] = rgb[0]
      img.data[idx + 1] = rgb[1]
      img.data[idx + 2] = rgb[2]
      img.data[idx + 3] = Math.round(clamp01(a) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(canvas, { srgb: true })
}

/** Soft hollow ghost for lens flare elements */
export function bakeFlareGhostTexture(size = 128) {
  const canvas = makeCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const half = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half
      const dy = (y - half) / half
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy))
      // gaussian band centered at d = 0.6
      const a = 0.16 * Math.exp(-Math.pow((d - 0.6) / 0.22, 2)) * (1 - smoothstep(0.92, 1, d))
      const idx = (y * size + x) * 4
      img.data[idx] = 255
      img.data[idx + 1] = 255
      img.data[idx + 2] = 255
      img.data[idx + 3] = Math.round(clamp01(a) * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(canvas, { srgb: true })
}

export { hsl }
