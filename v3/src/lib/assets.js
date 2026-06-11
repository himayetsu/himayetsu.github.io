// Asset pipeline: bakes every procedural texture the scene needs before the
// canvas mounts, reporting weighted real progress to the loading screen.

import {
  bakeHotPlanet,
  bakeHabitablePlanet,
  bakeIcePlanet,
  bakeExoticPlanet,
  bakeMoon,
  bakeRingTexture,
  bakeNebulaTexture,
  bakeGlowTexture,
  bakeFlareGhostTexture,
  hsl,
} from './textureGen'
import { createRng } from './prng'
import { SYSTEM_SEED } from '../config/solarSystem'

/** Filled by generateAllAssets(); read synchronously by scene components. */
export const assets = {
  planets: {}, // planetId -> { map, bumpMap, roughnessMap, emissiveMap?, cloudsMap? }
  moonVariants: [], // 3 reusable cratered moon texture sets
  ring: null,
  nebulae: [],
  glow: null,
  glowWarm: null,
  flareGhost: null,
}

const BAKERS = {
  hot: bakeHotPlanet,
  habitable: bakeHabitablePlanet,
  ice: bakeIcePlanet,
  exotic: bakeExoticPlanet,
  // gas giants are rendered with a live animated shader - nothing to bake
  gas: null,
}

let pipeline = null

/**
 * Idempotent (StrictMode-safe): concurrent callers share the same promise.
 * @param {Array} planets solar system config
 * @param {(fraction:number, label:string) => void} onProgress
 */
export function generateAllAssets(planets, onProgress) {
  if (!pipeline) pipeline = runPipeline(planets, onProgress)
  return pipeline
}

async function runPipeline(planets, onProgress) {
  const tasks = []

  const bakeable = planets.filter((p) => BAKERS[p.type])
  bakeable.forEach((p, i) => {
    tasks.push({
      label: `Synthesizing planetary surfaces ${i + 1} / ${bakeable.length}`,
      weight: 4,
      run: (report) => BAKERS[p.type](p.seed, report).then((maps) => { assets.planets[p.id] = maps }),
    })
  })

  for (let i = 0; i < 3; i++) {
    tasks.push({
      label: `Carving moons ${i + 1} / 3`,
      weight: 1.4,
      run: (report) =>
        bakeMoon(`${SYSTEM_SEED}:moon-variant-${i}`, report).then((m) => { assets.moonVariants[i] = m }),
    })
  }

  tasks.push({
    label: 'Forming ring systems',
    weight: 0.6,
    run: async (report) => {
      assets.ring = bakeRingTexture(`${SYSTEM_SEED}:rings`)
      report(1)
    },
  })

  tasks.push({
    label: 'Condensing nebulae',
    weight: 1.2,
    run: async (report) => {
      const rng = createRng(`${SYSTEM_SEED}:nebulae`)
      assets.nebulae = [0, 1, 2].map((i) => {
        const hue = rng.range(0, 360)
        return bakeNebulaTexture(
          `${SYSTEM_SEED}:nebula-${i}`,
          hsl(hue, rng.range(0.5, 0.7), rng.range(0.14, 0.22)),
          hsl(hue + rng.range(25, 70), rng.range(0.4, 0.6), rng.range(0.34, 0.48))
        )
      })
      report(1)
    },
  })

  tasks.push({
    label: 'Calibrating optics',
    weight: 0.4,
    run: async (report) => {
      assets.glow = bakeGlowTexture()
      assets.glowWarm = bakeGlowTexture([255, 192, 112])
      assets.flareGhost = bakeFlareGhostTexture()
      report(1)
    },
  })

  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0)
  let doneWeight = 0

  for (const task of tasks) {
    onProgress(doneWeight / totalWeight, task.label)
    await task.run((f) => {
      onProgress((doneWeight + task.weight * f) / totalWeight, task.label)
    })
    doneWeight += task.weight
  }

  onProgress(1, 'Igniting the sun')
}

// ---------------------------------------------------------------------------
// On-demand texture LOD: when a planet is focused for the first time, a 2x
// resolution set is baked in the background (chunked, non-blocking) and the
// live material is hot-swapped once ready.
// ---------------------------------------------------------------------------

const HI_RES = { width: 1536, height: 768 }
const hiResPromises = {}

export function upgradePlanetTextures(def) {
  const baker = BAKERS[def.type]
  if (!baker) return Promise.resolve(null)
  if (!hiResPromises[def.id]) {
    hiResPromises[def.id] = baker(def.seed, null, HI_RES)
  }
  return hiResPromises[def.id]
}
