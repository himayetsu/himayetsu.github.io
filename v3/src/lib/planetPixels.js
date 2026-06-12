// Pure planet-surface pixel programs (no DOM, no three.js) so the same code
// bakes on the main thread behind the loading screen AND inside the hi-res
// background worker. Each program maps a seed to a pixelFn that shades one
// point on the unit sphere into PBR channels.

import { createNoise3D } from './noise'
import { createRng } from './prng'

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smoothstep = (a, b, t) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}

/** HSL -> RGB (h 0-360, s/l 0-1), returns 0-255 array. Lets each seed pick
 *  genuinely different palettes instead of tiny offsets around fixed colors. */
export function hsl(h, s, l) {
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
export function ramp(stops, t) {
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

// ---------------------------------------------------------------------------
// Per-type programs. RNG call order is part of a planet's visual identity —
// keep it stable or every seed re-rolls its look.
// ---------------------------------------------------------------------------

const PROGRAMS = {
  /** Molten inner-system world: dark basalt crust, glowing lava fissures */
  hot(seed) {
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

    return {
      channels: ['color', 'bump', 'rough', 'emissive'],
      pixelFn: (x, y, z) => {
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
    }
  },

  /** Habitable-zone world: oceans, continents, ice caps + separate cloud layer */
  habitable(seed) {
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

    return {
      channels: ['color', 'bump', 'rough', 'cloud'],
      pixelFn: (x, y, z, lat01) => {
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
    }
  },

  /** Frozen outer world: pale blue ice sheets, turquoise pressure fractures */
  ice(seed) {
    const { fbm, ridged } = createNoise3D(seed)
    const rng = createRng(seed + ':palette')
    const hue = rng.range(175, 265)
    const iceBright = hsl(hue, rng.range(0.15, 0.35), rng.range(0.86, 0.94))
    const iceMid = hsl(hue, rng.range(0.3, 0.5), rng.range(0.66, 0.78))
    const iceDeep = hsl(hue + rng.range(-15, 15), rng.range(0.4, 0.6), rng.range(0.28, 0.45))
    const fracture = hsl(hue + rng.range(-35, 35), rng.range(0.6, 0.85), rng.range(0.52, 0.68))
    const fracScale = rng.range(2.4, 4.5)

    return {
      channels: ['color', 'bump', 'rough'],
      pixelFn: (x, y, z) => {
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
    }
  },

  /** Dark beacon world: near-black slate with luminous signal veins */
  exotic(seed) {
    const { fbm, ridged } = createNoise3D(seed)
    const rng = createRng(seed + ':palette')
    const baseHue = rng.range(215, 305)
    // vein family: cyan / magenta / toxic green
    const veinHue = rng.pick([rng.range(160, 200), rng.range(280, 330), rng.range(90, 140)])
    const baseDark = hsl(baseHue, rng.range(0.3, 0.5), rng.range(0.05, 0.09))
    const baseLight = hsl(baseHue, rng.range(0.25, 0.4), rng.range(0.15, 0.24))
    const veinColor = hsl(veinHue, 1.0, rng.range(0.58, 0.72))
    const veinScale = rng.range(2.0, 3.8)

    return {
      channels: ['color', 'bump', 'rough', 'emissive'],
      pixelFn: (x, y, z) => {
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
    }
  },
}

/** @returns {{ channels: string[], pixelFn: Function }} */
export function createPlanetPixelFn(type, seed) {
  return PROGRAMS[type](seed)
}

// ---------------------------------------------------------------------------
// Shared raw-buffer baking core (used by the canvas path and the worker)
// ---------------------------------------------------------------------------

export function allocChannelBuffers(w, h, channels) {
  const buffers = {}
  for (const ch of channels) buffers[ch] = new Uint8ClampedArray(w * h * 4)
  return buffers
}

/** Bake one equirectangular row of every channel into the RGBA buffers. */
export function bakeRow(w, h, y, pixelFn, buffers) {
  const theta = ((y + 0.5) / h) * Math.PI // 0 at north pole
  const sinT = Math.sin(theta)
  const cosT = Math.cos(theta)
  const lat01 = Math.abs(cosT) // 0 equator -> 1 poles
  const { color, bump, rough, emissive, cloud } = buffers
  for (let x = 0; x < w; x++) {
    const phi = ((x + 0.5) / w) * Math.PI * 2
    const nx = sinT * Math.cos(phi)
    const ny = cosT
    const nz = sinT * Math.sin(phi)
    const out = pixelFn(nx, ny, nz, lat01)
    const idx = (y * w + x) * 4

    if (color) {
      color[idx] = out.color[0]
      color[idx + 1] = out.color[1]
      color[idx + 2] = out.color[2]
      color[idx + 3] = 255
    }
    if (bump) {
      const b = Math.round(clamp01(out.bump) * 255)
      bump[idx] = b; bump[idx + 1] = b; bump[idx + 2] = b; bump[idx + 3] = 255
    }
    if (rough) {
      const r = Math.round(clamp01(out.rough) * 255)
      rough[idx] = r; rough[idx + 1] = r; rough[idx + 2] = r; rough[idx + 3] = 255
    }
    if (emissive) {
      const e = out.emissive || [0, 0, 0]
      emissive[idx] = e[0]; emissive[idx + 1] = e[1]; emissive[idx + 2] = e[2]; emissive[idx + 3] = 255
    }
    if (cloud) {
      // three.js alphaMap samples the green channel, so bake density to RGB
      const a = Math.round(clamp01(out.cloud || 0) * 255)
      cloud[idx] = a; cloud[idx + 1] = a; cloud[idx + 2] = a; cloud[idx + 3] = 255
    }
  }
}

/** Channel name -> [material slot, isSRGB] for planet texture sets. */
export const PLANET_TEXTURE_KEYS = {
  color: ['map', true],
  bump: ['bumpMap', false],
  rough: ['roughnessMap', false],
  emissive: ['emissiveMap', true],
  cloud: ['cloudsMap', false],
}
