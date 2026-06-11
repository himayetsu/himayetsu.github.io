import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { createRng } from '../lib/prng'
import { assets } from '../lib/assets'

/** Distant nebulae and galaxies: large additive sprites on a far shell. */
export default function Nebulae() {
  const groupRef = useRef()

  const sprites = useMemo(() => {
    const rng = createRng('nebulae-layout')
    const list = []
    for (let i = 0; i < 7; i++) {
      const u = rng.range(-0.75, 0.85)
      const theta = rng.range(0, Math.PI * 2)
      const r = rng.range(400, 480)
      const s = Math.sqrt(1 - u * u)
      list.push({
        kind: 'nebula',
        texIndex: rng.int(0, 2),
        position: [s * Math.cos(theta) * r, u * r, s * Math.sin(theta) * r],
        scale: rng.range(150, 280),
        opacity: rng.range(0.05, 0.12),
        rotation: rng.range(0, Math.PI * 2),
        spin: rng.range(-0.006, 0.006),
      })
    }
    for (let i = 0; i < 3; i++) {
      const u = rng.range(-0.6, 0.6)
      const theta = rng.range(0, Math.PI * 2)
      const r = rng.range(430, 490)
      const s = Math.sqrt(1 - u * u)
      list.push({
        kind: 'galaxy',
        position: [s * Math.cos(theta) * r, u * r, s * Math.sin(theta) * r],
        scaleX: rng.range(40, 62),
        scaleY: rng.range(12, 20),
        opacity: rng.range(0.05, 0.09),
        rotation: rng.range(0, Math.PI * 2),
        spin: 0,
      })
    }
    return list
  }, [])

  const matRefs = useRef([])

  useFrame((_, dt) => {
    for (let i = 0; i < sprites.length; i++) {
      const m = matRefs.current[i]
      if (m && sprites[i].spin) m.rotation += sprites[i].spin * dt
    }
  })

  return (
    <group ref={groupRef} renderOrder={-5}>
      {sprites.map((s, i) => (
        <sprite
          key={i}
          position={s.position}
          scale={s.kind === 'galaxy' ? [s.scaleX, s.scaleY, 1] : [s.scale, s.scale, 1]}
          raycast={() => null}
        >
          <spriteMaterial
            ref={(el) => (matRefs.current[i] = el)}
            map={s.kind === 'galaxy' ? assets.glow : assets.nebulae[s.texIndex]}
            color={s.kind === 'galaxy' ? '#cfc6bb' : '#ffffff'}
            transparent
            opacity={s.opacity}
            rotation={s.rotation}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  )
}
