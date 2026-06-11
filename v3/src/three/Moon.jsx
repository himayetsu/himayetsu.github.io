import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Detailed } from '@react-three/drei'
import { TYPE_STYLES } from '../config/solarSystem'
import { atmosphereShader } from './materials/shaders'
import { attachEclipse } from './materials/eclipse'
import { assets } from '../lib/assets'
import { createRng } from '../lib/prng'
import { register, getWorldPosition } from '../lib/registry'
import { useExperience } from '../store/useExperience'
import { MoonChip } from '../ui/labels'
import OrbitLine from './OrbitLine'

const _eclPos = new THREE.Vector3()

export default function Moon({ moon, planetDef }) {
  const style = TYPE_STYLES[planetDef.type]
  const anchorRef = useRef()
  const spinRef = useRef()

  const hovered = useExperience((s) => s.hoverMoonId === moon.id)
  const isTarget = useExperience((s) => s.moonId === moon.id)
  const planetFocused = useExperience((s) => s.focusId === moon.planetId)
  const phase = useExperience((s) => s.phase)
  const focusMoon = useExperience((s) => s.focusMoon)
  const setHoverMoon = useExperience((s) => s.setHoverMoon)

  // analytic eclipse caster: the parent planet (moons passing behind it go
  // through its umbra/penumbra cone); position synced each frame
  const eclCasters = useMemo(() => [new THREE.Vector4(0, -1e6, 0, 0)], [])

  const material = useMemo(() => {
    const maps = assets.moonVariants[moon.variant]
    // per-moon identity: a seeded hue tint over the near-neutral rock albedo,
    // plus varied relief depth, so no two moons read as the same grey rock
    const rng = createRng(moon.seed + ':identity')
    const tint = new THREE.Color().setHSL(rng.next(), rng.range(0.18, 0.5), rng.range(0.7, 0.85))
    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      color: tint,
      bumpMap: maps.bumpMap,
      bumpScale: moon.radius * rng.range(0.04, 0.1),
      roughnessMap: maps.roughnessMap,
      roughness: rng.range(0.85, 1),
      metalness: 0,
    })
    attachEclipse(mat, eclCasters)
    return mat
  }, [moon.variant, moon.radius, moon.seed, eclCasters])

  // volumetric hover highlight (rim shell)
  const haloMaterial = useMemo(() => {
    const shell = 1.35
    const silhouetteCos = Math.sqrt(Math.max(1 - 1 / (shell * shell), 0.02))
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereShader.vertexShader,
      fragmentShader: atmosphereShader.fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(style.halo) },
        uStrength: { value: 0 },
        uInner: { value: 1 / silhouetteCos },
        uFalloff: { value: 2.0 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [style.halo])

  useEffect(() => register(moon.id, anchorRef.current), [moon.id])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const a = moon.phase + t * moon.orbitSpeed
    anchorRef.current.position.set(
      Math.cos(a) * moon.orbitRadius,
      0,
      Math.sin(a) * moon.orbitRadius
    )
    if (spinRef.current) spinRef.current.rotation.y += moon.spinSpeed * dt
    if (getWorldPosition(moon.planetId, _eclPos)) {
      eclCasters[0].set(_eclPos.x, _eclPos.y, _eclPos.z, planetDef.radius)
    }
    const st = useExperience.getState()
    const on = st.hoverMoonId === moon.id || st.moonId === moon.id
    const u = haloMaterial.uniforms.uStrength
    u.value = THREE.MathUtils.damp(u.value, on ? 0.55 : 0, 6, dt)
  })

  const interactive = planetFocused && (phase === 'planet' || phase === 'moon')

  const handleOver = (e) => {
    e.stopPropagation()
    if (!interactive) return
    setHoverMoon(moon.id)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = () => {
    if (useExperience.getState().hoverMoonId === moon.id) setHoverMoon(null)
    document.body.style.cursor = 'auto'
  }
  const handleClick = (e) => {
    e.stopPropagation()
    if (e.delta > 6) return // was a camera drag, not a click
    if (!interactive || isTarget) return
    focusMoon(moon.id)
  }

  return (
    <group rotation-x={moon.inclination}>
      <OrbitLine
        radius={moon.orbitRadius}
        color="#94a3b8"
        segments={96}
        computeOpacity={(s) => {
          const active = s.focusId === moon.planetId && (s.phase === 'planet' || s.phase === 'moon')
          if (!active) return 0
          return s.hoverMoonId === moon.id || s.moonId === moon.id ? 0.35 : 0.1
        }}
      />

      <group ref={anchorRef}>
        <group onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
          <group ref={spinRef}>
            <Detailed distances={[0, 50]}>
              <mesh material={material}>
                <sphereGeometry args={[moon.radius, 24, 12]} />
              </mesh>
              <mesh material={material}>
                <sphereGeometry args={[moon.radius, 10, 6]} />
              </mesh>
            </Detailed>
          </group>
          {/* hit target kept tight enough that adjacent moons never overlap */}
          <mesh>
            <sphereGeometry args={[moon.radius * 1.7, 8, 6]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>

        <mesh material={haloMaterial} scale={1.35} raycast={() => null}>
          <sphereGeometry args={[moon.radius, 24, 12]} />
        </mesh>

        {interactive && (hovered || isTarget) && (
          <MoonChip
            position={[0, moon.radius * 2.6, 0]}
            label={moon.label}
            sub={isTarget ? null : 'Click to inspect'}
          />
        )}
      </group>
    </group>
  )
}
