import { useMemo } from 'react'
import * as THREE from 'three'
import { Stars } from '@react-three/drei'
import { createRng } from '../lib/prng'
import { assets } from '../lib/assets'

const STAR_PALETTE = ['#ffffff', '#cfe2ff', '#ffe9c4', '#ffd2a1', '#b8d0ff', '#f5f9ff']

/** A handful of larger, colored hero stars layered over the dense drei field. */
function BrightStars({ count = 240, size = 3.2, seed = 'bright-stars' }) {
  const { positions, colors } = useMemo(() => {
    const rng = createRng(seed)
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      // random direction, pushed to a far shell
      const u = rng.range(-1, 1)
      const theta = rng.range(0, Math.PI * 2)
      const r = rng.range(380, 470)
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = s * Math.cos(theta) * r
      pos[i * 3 + 1] = u * r
      pos[i * 3 + 2] = s * Math.sin(theta) * r
      c.set(rng.pick(STAR_PALETTE)).multiplyScalar(rng.range(0.5, 1.0))
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    return { positions: pos, colors: col }
  }, [count, seed])

  return (
    <points raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={assets.glow}
        size={size}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

export default function Starfield() {
  return (
    <group>
      <Stars radius={420} depth={140} count={6000} factor={4.5} saturation={0.18} fade speed={0.6} />
      <BrightStars count={220} size={3.4} seed="bright-a" />
      <BrightStars count={120} size={5.5} seed="bright-b" />
    </group>
  )
}
