import { useMemo } from 'react'
import * as THREE from 'three'
import { atmosphereShader } from './materials/shaders'

/** Additive scattering shell rendered on the back faces of an enlarged sphere. */
export default function Atmosphere({ radius, color, strength = 1, shell = 1.14 }) {
  const material = useMemo(() => {
    const silhouetteCos = Math.sqrt(Math.max(1 - 1 / (shell * shell), 0.02))
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereShader.vertexShader,
      fragmentShader: atmosphereShader.fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: strength },
        uInner: { value: 1 / silhouetteCos },
        uFalloff: { value: 1.9 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [color, strength, shell])

  return (
    <mesh material={material} scale={shell} raycast={() => null}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  )
}
