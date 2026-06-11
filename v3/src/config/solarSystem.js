// Solar system layout. The whole system is described by a single random seed
// (override with ?seed=ANYTHING in the URL); every planet derives its visual
// identity, orbit and moons deterministically from it.
//
// Orbit radii are packed outward in fixed section order so that a planet's
// full moon system (plus rings) can never intersect a neighbouring orbit.
// Only the planet visuals (textures, palettes, moons) are randomized per seed.

import { createRng, randomSeedString } from '../lib/prng'
import { allProjects, experience, education } from '../data/content'

function seedFromUrl() {
  if (typeof window === 'undefined') return null
  const s = new URLSearchParams(window.location.search).get('seed')
  return s && s.trim() ? s.trim().toUpperCase() : null
}

export const SYSTEM_SEED = seedFromUrl() || randomSeedString()

export const SUN_RADIUS = 10
export const RING_INNER = 1.25 // x planet radius
export const RING_OUTER = 2.7
const ORBIT_K = 11 // planet angular speed = K / r^1.5  (Kepler-flavoured)
const MOON_K = 3.0
const ORBIT_GAP = 4.5 // free space between adjacent planetary systems

function keplerSpeed(radius, k = ORBIT_K) {
  return k / Math.pow(radius, 1.5)
}

/**
 * Every moon gets its own orbit radius with a guaranteed minimum gap.
 * dense: tighter packing for big moon families (gas giants).
 * rings: first moon orbit starts beyond the ring system.
 */
function buildMoons(planetId, planetRadius, items, labelFn, { dense = false, rings = false, reverseNumbering = false, outerFirst = false } = {}) {
  const rng = createRng(`${SYSTEM_SEED}:${planetId}:moons`)
  const start = rings ? planetRadius * (RING_OUTER + 0.25) : planetRadius * (dense ? 1.5 : 1.65)
  const step = dense ? Math.max(1.25, planetRadius * 0.165) : Math.max(1.75, planetRadius * 0.24)
  return items.map((item, i) => {
    // outerFirst: first item in the list (e.g. most recent role) takes the
    // outermost orbit instead of the innermost
    const orbitRadius = start + (outerFirst ? items.length - 1 - i : i) * step
    return {
      id: `${planetId}:${i}`,
      planetId,
      index: i,
      // shown as "NN / total" — newest-first lists count down so the most
      // recent item reads as the highest number
      displayIndex: reverseNumbering ? items.length - i : i + 1,
      label: labelFn(item),
      item,
      seed: `${SYSTEM_SEED}:${planetId}:moon:${i}`,
      variant: i % 3,
      radius: rng.range(0.42, 0.62) * (planetRadius > 4 ? 1.25 : 1),
      orbitRadius,
      orbitSpeed: keplerSpeed(orbitRadius, MOON_K) * rng.range(0.95, 1.05),
      phase: rng.range(0, Math.PI * 2),
      inclination: rng.range(-0.12, 0.12),
      spinSpeed: rng.range(0.05, 0.18),
    }
  })
}

// Section definitions in fixed distance order: about, experience, projects,
// education, contact. Sizes reflect importance / number of moons.
const BASE = [
  {
    id: 'about',
    name: 'Cinder',
    type: 'hot',
    radius: 4.0,
    section: {
      title: 'About Me',
      hint: 'Bio, skills & stats',
    },
    moons: [],
  },
  {
    id: 'experience',
    name: 'Veridia',
    type: 'habitable',
    radius: 5.0,
    section: {
      title: 'Experience',
      hint: 'Each moon is a role — click one',
    },
    moons: buildMoons('experience', 5.0, experience, (e) => e.company, { reverseNumbering: true, outerFirst: true }),
  },
  {
    id: 'projects',
    name: 'Atlas',
    type: 'gas',
    radius: 7.5,
    section: {
      title: 'Projects',
      hint: `${allProjects.length} moons — one per project`,
    },
    moons: buildMoons('projects', 7.5, allProjects, (p) => p.title, { dense: true }),
  },
  {
    id: 'education',
    name: 'Glacia',
    type: 'ice',
    radius: 3.4,
    rings: true,
    section: {
      title: 'Education',
      hint: 'University of Waterloo',
    },
    moons: buildMoons('education', 3.4, education, (e) => e.school, { rings: true }),
  },
  {
    id: 'contact',
    name: 'Umbra',
    type: 'exotic',
    radius: 2.8,
    section: {
      title: 'Contact',
      hint: 'Email & socials',
    },
    moons: [],
  },
]

/** Radial half-extent of a planet's whole system (moons, rings, body). */
function systemExtent(d) {
  const moonMax = d.moons.reduce((m, mo) => Math.max(m, mo.orbitRadius + mo.radius), 0)
  const ringMax = d.rings ? d.radius * RING_OUTER : 0
  return Math.max(d.radius * 1.8, moonMax + 0.8, ringMax + 0.8)
}

// pack orbits outward in fixed section order so moon systems never overlap
const orbitById = {}
let cursor = SUN_RADIUS + 10
for (const d of BASE) {
  const extent = systemExtent(d)
  orbitById[d.id] = cursor + extent
  cursor = orbitById[d.id] + extent + ORBIT_GAP
}

/** Outer edge of the whole system — the overview camera frames this. */
export const SYSTEM_EXTENT = cursor - ORBIT_GAP

function planet(d) {
  const rng = createRng(`${SYSTEM_SEED}:${d.id}`)
  const orbitRadius = orbitById[d.id]
  const orbitFrac = orbitRadius / SYSTEM_EXTENT
  return {
    ...d,
    // camera framing tier: inner planets shoot outward across the system,
    // outer planets shoot back toward the sun, the middle keeps the side-on shot
    shot: orbitFrac < 0.45 ? 'near' : orbitFrac > 0.72 ? 'far' : 'mid',
    rings: !!d.rings,
    seed: `${SYSTEM_SEED}:${d.id}`,
    orbitRadius,
    orbitSpeed: keplerSpeed(orbitRadius),
    orbitPhase: rng.range(0, Math.PI * 2),
    inclination: rng.range(-0.035, 0.035),
    axialTilt: rng.range(-0.35, 0.35),
    spinSpeed: d.type === 'gas' ? rng.range(0.05, 0.09) : rng.range(0.015, 0.04),
    // camera distance must clear the outermost moon orbit with margin
    viewDistance: Math.max(
      d.radius * 5,
      d.moons.reduce((m, mo) => Math.max(m, mo.orbitRadius), 0) * 2.0
    ),
  }
}

export const PLANETS = BASE.map(planet)

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]))

export function findMoon(moonId) {
  if (!moonId) return null
  const planetId = moonId.split(':')[0]
  const p = PLANET_BY_ID[planetId]
  return p?.moons.find((m) => m.id === moonId) || null
}

// Atmosphere + identity colors per planet type
export const TYPE_STYLES = {
  hot: { atmosphere: '#ff7733', halo: '#ffb347', accent: '#ff9355' },
  habitable: { atmosphere: '#6ab7ff', halo: '#9fd4ff', accent: '#7cc4ff' },
  gas: { atmosphere: '#e8b98a', halo: '#ffd9a8', accent: '#f0c490' },
  ice: { atmosphere: '#9fd8ff', halo: '#c9ecff', accent: '#a8dcff' },
  exotic: { atmosphere: '#7d5fff', halo: '#9d86ff', accent: '#a78bfa' },
}
