import { useMemo } from 'react'
import * as THREE from 'three'
import { RING_INNER, RING_OUTER } from '../config/solarSystem'
import { assets } from '../lib/assets'

/** Planar ring system (Saturn-style) using the baked concentric band texture. */
export default function Rings({ planetRadius }) {
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(planetRadius * RING_INNER, planetRadius * RING_OUTER, 160, 1)
    g.rotateX(-Math.PI / 2)
    return g
  }, [planetRadius])

  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={2}>
      <meshBasicMaterial
        map={assets.ring}
        color="#dfe8f5"
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}
