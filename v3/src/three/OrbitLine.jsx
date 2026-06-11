import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useExperience } from '../store/useExperience'

/**
 * Subtle circular orbit indicator whose opacity reacts to the experience
 * state. `computeOpacity(state)` is evaluated every frame and damped.
 */
export default function OrbitLine({ radius, color, computeOpacity, segments = 192 }) {
  const matRef = useRef()

  const geometry = useMemo(() => {
    const pts = new Float32Array((segments + 1) * 3)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2
      pts[i * 3] = Math.cos(a) * radius
      pts[i * 3 + 1] = 0
      pts[i * 3 + 2] = Math.sin(a) * radius
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    return g
  }, [radius, segments])

  useFrame((_, dt) => {
    if (!matRef.current) return
    const target = computeOpacity(useExperience.getState())
    matRef.current.opacity = THREE.MathUtils.damp(matRef.current.opacity, target, 4, dt)
  })

  return (
    <line geometry={geometry} raycast={() => null}>
      <lineBasicMaterial ref={matRef} color={color} transparent opacity={0} depthWrite={false} />
    </line>
  )
}
