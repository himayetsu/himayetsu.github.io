import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import { sunShader } from './materials/shaders'
import { SUN_RADIUS } from '../config/solarSystem'
import { assets } from '../lib/assets'
import { useExperience } from '../store/useExperience'
import { HoloLabel } from '../ui/labels'

export default function Sun() {
  const materialRef = useRef()
  const coreRef = useRef()
  const flareAnchorRef = useRef()
  const setSunMesh = useExperience((s) => s.setSunMesh)
  const goHome = useExperience((s) => s.goHome)
  const setHover = useExperience((s) => s.setHover)
  const hovered = useExperience((s) => s.hoverId === 'sun')
  const phase = useExperience((s) => s.phase)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sunShader.vertexShader,
        fragmentShader: sunShader.fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColorDeep: { value: new THREE.Color('#b53407') },
          uColorMid: { value: new THREE.Color('#ff9a2a') },
          uColorHot: { value: new THREE.Color('#fff3c8') },
        },
      }),
    []
  )

  // flare: soft glow on the sun itself (kept subtle) plus a pronounced ghost
  // chain marching across the lens axis
  const lensflare = useMemo(() => {
    const lf = new Lensflare()
    lf.addElement(new LensflareElement(assets.glowWarm, 380, 0, new THREE.Color('#e0b070')))
    lf.addElement(new LensflareElement(assets.flareGhost, 70, 0.32, new THREE.Color('#5d7396')))
    lf.addElement(new LensflareElement(assets.glow, 30, 0.5, new THREE.Color('#4c5f86')))
    lf.addElement(new LensflareElement(assets.flareGhost, 210, 0.72, new THREE.Color('#46597e')))
    lf.addElement(new LensflareElement(assets.glow, 52, 0.9, new THREE.Color('#3d4f73')))
    lf.addElement(new LensflareElement(assets.flareGhost, 150, 1.08, new THREE.Color('#374968')))
    return lf
  }, [])

  useEffect(() => {
    if (coreRef.current) setSunMesh(coreRef.current)
    return () => setSunMesh(null)
  }, [setSunMesh])

  useEffect(() => () => lensflare.dispose(), [lensflare])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    // keep the flare emitter on the camera-facing surface of the sun so the
    // sun's own geometry never occludes it
    if (flareAnchorRef.current) {
      flareAnchorRef.current.position
        .copy(state.camera.position)
        .normalize()
        .multiplyScalar(SUN_RADIUS * 1.18)
    }
  })

  // hoverable from the overview and from planet/moon views (shortcut home)
  const interactive = phase === 'system' || phase === 'planet' || phase === 'moon'

  return (
    <group>
      <mesh
        ref={coreRef}
        material={material}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (!interactive) return
          setHover('sun')
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          if (useExperience.getState().hoverId === 'sun') setHover(null)
          document.body.style.cursor = 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.delta > 6) return // was a camera drag, not a click
          const p = useExperience.getState().phase
          if (p === 'system' || p === 'planet' || p === 'moon') goHome()
        }}
      >
        <sphereGeometry args={[SUN_RADIUS, 64, 32]} />
      </mesh>

      {/* corona layers */}
      <sprite scale={[SUN_RADIUS * 3.4, SUN_RADIUS * 3.4, 1]} renderOrder={1} raycast={() => null}>
        <spriteMaterial
          map={assets.glowWarm}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite scale={[SUN_RADIUS * 7.5, SUN_RADIUS * 7.5, 1]} renderOrder={1} raycast={() => null}>
        <spriteMaterial
          map={assets.glowWarm}
          transparent
          opacity={0.42}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* key light of the whole system; eclipses/shadows are computed
          analytically per material (see materials/eclipse.js), so no
          shadow map is needed */}
      <pointLight color="#fff1dc" intensity={2.1} decay={0} />

      <group ref={flareAnchorRef}>
        <primitive object={lensflare} />
      </group>

      {hovered && interactive && (
        <HoloLabel title="Home" cta="Click to reset the view" />
      )}
    </group>
  )
}
