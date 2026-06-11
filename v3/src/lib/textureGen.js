// CPU procedural texture baking.
//
// Every planet surface is baked from its seed into seamless equirectangular
// PBR maps (albedo / bump / roughness / emissive) by sampling seeded 3D
// simplex noise on the unit sphere. Baking is chunked row-by-row and yields to
// the event loop, which is what drives the *real* progress bar on the loading
// screen — no fake timers.

import * as THREE from 'three'
import { createNoise3D } from './noise'
import { createRng } from './prng'

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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, t) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}

/** HSL -> RGB (h 0-360, s/l 0-1), returns 0-255 array. Lets each seed pick
 *  genuinely different palettes instead of tiny offsets around fixed colors. */
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Multi-stop color ramp. stops: [[t, [r,g,b]], ...] with t ascending, rgb 0-255 */
function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0)
      return [lerp(c0[0], c1[0], f), lerp(c0[1], c1[1], f), lerp(c0[2], c1[2], f)]
    }
  }
  return stops[stops.length - 1][1]
}

/**
 * Generic equirectangular sphere baker.
 * pixelFn(nx, ny, nz, lat01) returns { color:[r,g,b], bump:0-1, rough:0-1, emissive?:[r,g,b], cloud?:0-1 }
 */
async function bakeSphere(w, h, pixelFn, channels, onProgress) {
  // keep each chunk to ~18k pixels so hi-res background bakes stay smooth
  const rowsPerChunk = Math.max(4, Math.round(18432 / w))
  const buffers = {}
  for (const ch of channels) {
    buffers[ch] = { canvas: makeCanvas(w, h), data: null }
    buffers[ch].ctx = buffers[ch].canvas.getContext('2d')
    buffers[ch].img = buffers[ch].ctx.createImageData(w, h)
  }

  for (let y = 0; y < h; y++) {
    const theta = ((y + 0.5) / h) * Math.PI // 0 at north pole
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)
    const lat01 = Math.abs(cosT) // 0 equator -> 1 poles
    for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w) * Math.PI * 2
      const nx = sinT * Math.cos(phi)
      const ny = cosT
      const nz = sinT * Math.sin(phi)
      const out = pixelFn(nx, ny, nz, lat01)
      const idx = (y * w + x) * 4

      if (buffers.color) {
        const d = buffers.color.img.data
        d[idx] = out.color[0]
        d[idx + 1] = out.color[1]
        d[idx + 2] = out.color[2]
        d[idx + 3] = 255
      }
      if (buffers.bump) {
        const d = buffers.bump.img.data
        const b = Math.round(clamp01(out.bump) * 255)
        d[idx] = b; d[idx + 1] = b; d[idx + 2] = b; d[idx + 3] = 255
      }
      if (buffers.rough) {
        const d = buffers.rough.img.data
        const r = Math.round(clamp01(out.rough) * 255)
        d[idx] = r; d[idx + 1] = r; d[idx + 2] = r; d[idx + 3] = 255
      }
      if (buffers.emissive) {
        const d = buffers.emissive.img.data
        const e = out.emissive || [0, 0, 0]
        d[idx] = e[0]; d[idx + 1] = e[1]; d[idx + 2] = e[2]; d[idx + 3] = 255
      }
      if (buffers.cloud) {
        // three.js alphaMap samples the green channel, so bake density to RGB
        const d = buffers.cloud.img.data
        const a = Math.round(clamp01(out.cloud || 0) * 255)
        d[idx] = a; d[idx + 1] = a; d[idx + 2] = a; d[idx + 3] = 255
      }
    }
    if (y % rowsPerChunk === rowsPerChunk - 1) {
      onProgress?.((y + 1) / h)
      await nextTick()
    }
  }

  const result = {}
  for (const ch of channels) {
    buffers[ch].ctx.putImageData(buffers[ch].img, 0, 0)
    result[ch] = buffers[ch].canvas
  }
  onProgress?.(1)
  return result
}

// ---------------------------------------------------------------------------
// Planet types
// ---------------------------------------------------------------------------

/** Molten inner-system world: dark basalt crust, glowing lava fissures */
export async function bakeHotPlanet(seed, onProgress, opts = {}) {
  const W = opts.width ?? PLANET_TEX_W
  const H = opts.height ?? PLANET_TEX_H
  const { fbm, ridged } = createNoise3D(seed)
  const rng = createRng(seed + ':palette')
  const crustHue = rng.range(0, 45)
  const lavaHue = rng.range(5, 45)
  const crustDark = hsl(crustHue, rng.range(0.2, 0.45), rng.range(0.05, 0.1))
  const crustLight = hsl(crustHue + rng.range(-12, 12), rng.range(0.15, 0.35), rng.range(0.2, 0.34))
  const crustHigh = hsl(crustHue, rng.range(0.1, 0.25), rng.range(0.28, 0.38))
  const lavaHot = hsl(lavaHue + 15, 1.0, rng.range(0.56, 0.7))
  const lavaCool = hsl(lavaHue, 0.95, rng.range(0.36, 0.48))
  const crackScale = rng.range(1.6, 3.6)
  const crackThresh = rng.range(0.62, 0.78)
  const terrainScale = rng.range(1.8, 3.2)

  const maps = await bakeSphere(
    W, H,
    (x, y, z) => {
      const e = fbm(x * terrainScale, y * terrainScale, z * terrainScale, 5)
      const r = ridged(x * crackScale, y * crackScale, z * crackScale, 5)
      const crack = smoothstep(crackThresh, crackThresh + 0.16, r)
      const heat = crack * (0.55 + 0.45 * fbm(x * 6, y * 6, z * 6, 3))

      const base = ramp(
        [[0, crustDark], [0.55, crustLight], [1, crustHigh]],
        clamp01(e * 0.5 + 0.5)
      )
      const lava = ramp([[0, lavaCool], [1, lavaHot]], clamp01(heat))
      const color = [
        lerp(base[0], lava[0], crack),
        lerp(base[1], lava[1], crack),
        lerp(base[2], lava[2], crack),
      ]
      return {
        color,
        bump: clamp01(0.5 + e * 0.5 - crack * 0.35),
        rough: clamp01(0.92 - crack * 0.5),
        emissive: [lava[0] * heat, lava[1] * heat * 0.85, lava[2] * heat * 0.5],
      }
    },
    ['color', 'bump', 'rough', 'emissive'],
    onProgress
  )

  return {
    map: toTexture(maps.color, { srgb: true }),
    bumpMap: toTexture(maps.bump),
    roughnessMap: toTexture(maps.rough),
    emissiveMap: toTexture(maps.emissive, { srgb: true }),
  }
}

/** Habitable-zone world: oceans, continents, ice caps + separate cloud layer */
export async function bakeHabitablePlanet(seed, onProgress, opts = {}) {
  const W = opts.width ?? PLANET_TEX_W
  const H = opts.height ?? PLANET_TEX_H
  const { fbm, noise3D } = createNoise3D(seed)
  const cloudNoise = createNoise3D(seed + ':clouds')
  const rng = createRng(seed + ':palette')

  const seaLevel = rng.range(-0.18, 0.12)
  const hueOcean = rng.range(185, 245)
  // land family: temperate green / arid amber / cold teal
  const hueLand = rng.pick([rng.range(75, 140), rng.range(35, 75), rng.range(140, 175)])
  const oceanDeep = hsl(hueOcean, rng.range(0.55, 0.75), rng.range(0.1, 0.17))
  const oceanShallow = hsl(hueOcean - rng.range(5, 20), rng.range(0.45, 0.65), rng.range(0.26, 0.38))
  const sand = hsl(rng.range(35, 55), rng.range(0.3, 0.5), rng.range(0.55, 0.68))
  const grass = hsl(hueLand, rng.range(0.35, 0.55), rng.range(0.26, 0.38))
  const forest = hsl(hueLand + rng.range(5, 20), rng.range(0.4, 0.6), rng.range(0.14, 0.24))
  const rock = hsl(rng.range(20, 40), rng.range(0.05, 0.15), rng.range(0.35, 0.45))
  const snow = [238, 242, 248]
  const iceLat = rng.range(0.72, 0.92)
  const warpAmt = rng.range(0.3, 0.85)
  const contFreq = rng.range(1.5, 2.4)
  // target cloud coverage: 10-30% of the surface
  const cloudCover = rng.range(0.1, 0.3)
  const cloudThresh = 0.74 - cloudCover * 0.55

  const maps = await bakeSphere(
    W, H,
    (x, y, z, lat01) => {
      // domain warp gives continents organic coastlines
      const wx = x + warpAmt * fbm(x * 1.6 + 13.7, y * 1.6, z * 1.6, 3)
      const wy = y + warpAmt * fbm(x * 1.6, y * 1.6 + 41.3, z * 1.6, 3)
      const wz = z + warpAmt * fbm(x * 1.6, y * 1.6, z * 1.6 + 27.9, 3)
      const e = fbm(wx * contFreq, wy * contFreq, wz * contFreq, 6)
      const detail = fbm(x * 9, y * 9, z * 9, 3) * 0.08

      const land = e > seaLevel
      const iceMask = smoothstep(iceLat, iceLat + 0.07, lat01 + noise3D(x * 4, y * 4, z * 4) * 0.05)

      let color, rough, bump
      if (!land) {
        const depth = clamp01((seaLevel - e) * 2.2)
        color = ramp([[0, oceanShallow], [1, oceanDeep]], depth)
        rough = 0.32
        bump = 0.42
      } else {
        const alt = clamp01((e - seaLevel) * 2.6 + detail)
        color = ramp(
          [[0, sand], [0.12, grass], [0.45, forest], [0.72, rock], [0.92, snow]],
          alt
        )
        rough = 0.88
        bump = 0.45 + alt * 0.55
      }
      if (iceMask > 0.01) {
        color = [
          lerp(color[0], snow[0], iceMask),
          lerp(color[1], snow[1], iceMask),
          lerp(color[2], snow[2], iceMask),
        ]
        rough = lerp(rough, 0.42, iceMask)
      }

      // clouds: banded fbm with swirl, thresholded to the seeded coverage
      const cb = cloudNoise.fbm(x * 2.6, y * 4.2, z * 2.6, 5)
      const cd = cloudNoise.fbm(x * 7 + 3.1, y * 7, z * 7, 3)
      const cloud = smoothstep(cloudThresh, cloudThresh + 0.22, cb * 0.5 + 0.5 + cd * 0.18)

      return { color, bump, rough, cloud }
    },
    ['color', 'bump', 'rough', 'cloud'],
    onProgress
  )

  return {
    map: toTexture(maps.color, { srgb: true }),
    bumpMap: toTexture(maps.bump),
    roughnessMap: toTexture(maps.rough),
    cloudsMap: toTexture(maps.cloud),
  }
}

/** Frozen outer world: pale blue ice sheets, turquoise pressure fractures */
export async function bakeIcePlanet(seed, onProgress, opts = {}) {
  const W = opts.width ?? PLANET_TEX_W
  const H = opts.height ?? PLANET_TEX_H
  const { fbm, ridged } = createNoise3D(seed)
  const rng = createRng(seed + ':palette')
  const hue = rng.range(175, 265)
  const iceBright = hsl(hue, rng.range(0.15, 0.35), rng.range(0.86, 0.94))
  const iceMid = hsl(hue, rng.range(0.3, 0.5), rng.range(0.66, 0.78))
  const iceDeep = hsl(hue + rng.range(-15, 15), rng.range(0.4, 0.6), rng.range(0.28, 0.45))
  const fracture = hsl(hue + rng.range(-35, 35), rng.range(0.6, 0.85), rng.range(0.52, 0.68))
  const fracScale = rng.range(2.4, 4.5)

  const maps = await bakeSphere(
    W, H,
    (x, y, z) => {
      const e = fbm(x * 2.0, y * 2.0, z * 2.0, 5)
      const r = ridged(x * fracScale, y * fracScale, z * fracScale, 4)
      const crack = smoothstep(0.74, 0.88, r)
      const t = clamp01(e * 0.5 + 0.5)
      let color = ramp([[0, iceDeep], [0.45, iceMid], [1, iceBright]], t)
      color = [
        lerp(color[0], fracture[0], crack * 0.8),
        lerp(color[1], fracture[1], crack * 0.8),
        lerp(color[2], fracture[2], crack * 0.8),
      ]
      return {
        color,
        bump: clamp01(0.5 + e * 0.4 - crack * 0.3),
        rough: clamp01(0.34 + (1 - t) * 0.3),
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

/** Dark beacon world: near-black slate with luminous signal veins */
export async function bakeExoticPlanet(seed, onProgress, opts = {}) {
  const W = opts.width ?? PLANET_TEX_W
  const H = opts.height ?? PLANET_TEX_H
  const { fbm, ridged } = createNoise3D(seed)
  const rng = createRng(seed + ':palette')
  const baseHue = rng.range(215, 305)
  // vein family: cyan / magenta / toxic green
  const veinHue = rng.pick([rng.range(160, 200), rng.range(280, 330), rng.range(90, 140)])
  const baseDark = hsl(baseHue, rng.range(0.3, 0.5), rng.range(0.05, 0.09))
  const baseLight = hsl(baseHue, rng.range(0.25, 0.4), rng.range(0.15, 0.24))
  const veinColor = hsl(veinHue, 1.0, rng.range(0.58, 0.72))
  const veinScale = rng.range(2.0, 3.8)

  const maps = await bakeSphere(
    W, H,
    (x, y, z) => {
      const e = fbm(x * 2.2, y * 2.2, z * 2.2, 5)
      const r = ridged(x * veinScale, y * veinScale, z * veinScale, 5)
      const vein = smoothstep(0.76, 0.9, r)
      const spark = smoothstep(0.965, 1.0, fbm(x * 14, y * 14, z * 14, 2) * 0.5 + 0.5)
      const glow = clamp01(vein * 0.9 + spark * 1.4)
      const t = clamp01(e * 0.5 + 0.5)
      const base = ramp([[0, baseDark], [1, baseLight]], t)
      return {
        color: [
          lerp(base[0], veinColor[0], vein * 0.5),
          lerp(base[1], veinColor[1], vein * 0.5),
          lerp(base[2], veinColor[2], vein * 0.5),
        ],
        bump: clamp01(0.5 + e * 0.45),
        rough: clamp01(0.75 - vein * 0.3),
        emissive: [veinColor[0] * glow, veinColor[1] * glow, veinColor[2] * glow],
      }
    },
    ['color', 'bump', 'rough', 'emissive'],
    onProgress
  )

  return {
    map: toTexture(maps.color, { srgb: true }),
    bumpMap: toTexture(maps.bump),
    roughnessMap: toTexture(maps.rough),
    emissiveMap: toTexture(maps.emissive, { srgb: true }),
  }
}

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
