// Deterministic seeded randomness. Every planet derives all of its visual
// characteristics from a single seed string, so a seed fully describes a world.

/** xmur3 string hash -> 32bit int generator */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

/** mulberry32 PRNG from a 32bit seed */
export function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Rich RNG helper from any seed string */
export function createRng(seedString) {
  const next = mulberry32(hashSeed(String(seedString))())
  return {
    /** float in [0,1) */
    next,
    /** float in [min,max) */
    range: (min, max) => min + next() * (max - min),
    /** integer in [min,max] inclusive */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** pick a random element */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** random sign */
    sign: () => (next() < 0.5 ? -1 : 1),
  }
}

/** Generate a short human-readable random seed, e.g. "KEPLER-7F3A" */
export function randomSeedString() {
  const chars = 'ABCDEF0123456789'
  let tail = ''
  for (let i = 0; i < 4; i++) tail += chars[Math.floor(Math.random() * chars.length)]
  const prefixes = ['KEPLER', 'TRAPPIST', 'GLIESE', 'VEGA', 'LYRA', 'ORION', 'CYGNUS', 'TAU']
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
  return `${prefix}-${tail}`
}
