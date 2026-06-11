import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Detailed } from '@react-three/drei'
import { gasGiantShader, atmosphereShader } from './materials/shaders'
import { attachEclipse } from './materials/eclipse'
import { TYPE_STYLES } from '../config/solarSystem'
import { createRng } from '../lib/prng'
import { assets, upgradePlanetTextures } from '../lib/assets'
import { register, getWorldPosition } from '../lib/registry'
import { useExperience } from '../store/useExperience'
import { HoloLabel } from '../ui/labels'
import Atmosphere from './Atmosphere'
import Rings from './Rings'
import OrbitLine from './OrbitLine'
import Moon from './Moon'

const ATMO_STRENGTH = { hot: 0.7, habitable: 1.0, gas: 0.85, ice: 0.6, exotic: 0.6 }
const ORBIT_COLOR = '#94a3b8'

const _eclPos = new THREE.Vector3()

export default function Planet({ def }) {
  const style = TYPE_STYLES[def.type]
  const anchorRef = useRef()
  const spinRef = useRef()
  const cloudRef = useRef()
  const hitRef = useRef()

  const hovered = useExperience((s) => s.hoverId === def.id)
  const phase = useExperience((s) => s.phase)
  const focused = useExperience((s) => s.focusId === def.id)
  const focusPlanet = useExperience((s) => s.focusPlanet)
  const setHover = useExperience((s) => s.setHover)

  const maps = assets.planets[def.id]

  // analytic eclipse casters: this planet's moons (world position + radius),
  // updated every frame in useFrame
  const eclCasters = useMemo(
    () => def.moons.map(() => new THREE.Vector4(0, -1e6, 0, 0)),
    [def]
  )

  const surfaceMaterial = useMemo(() => {
    if (def.type === 'gas') {
      const rng = createRng(def.seed + ':gaspalette')
      // seeded hue family: amber / blue / jade / rose giants and everything between
      const hue = rng.pick([
        rng.range(0.05, 0.12),
        rng.range(0.55, 0.66),
        rng.range(0.25, 0.42),
        rng.range(0.82, 0.96),
      ])
      const col = (dh, s, l) => new THREE.Color().setHSL((hue + dh + 1) % 1, s, l)
      return new THREE.ShaderMaterial({
        vertexShader: gasGiantShader.vertexShader,
        fragmentShader: gasGiantShader.fragmentShader,
        defines: { ECL_MAX: Math.max(1, eclCasters.length) },
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: rng.range(0, 100) },
          uColorA: { value: col(0, rng.range(0.25, 0.45), rng.range(0.4, 0.52)) },
          uColorB: { value: col(rng.range(-0.04, 0.04), rng.range(0.3, 0.5), rng.range(0.65, 0.78)) },
          uColorC: { value: col(rng.range(-0.06, 0.06), rng.range(0.3, 0.5), rng.range(0.24, 0.34)) },
          uColorStorm: { value: col(0, rng.range(0.12, 0.28), rng.range(0.8, 0.9)) },
          uEclCasters: { value: eclCasters.length ? eclCasters : [new THREE.Vector4(0, -1e6, 0, 0)] },
          uEclCount: { value: eclCasters.length },
        },
      })
    }
    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      bumpMap: maps.bumpMap,
      bumpScale: def.radius * 0.02,
      roughnessMap: maps.roughnessMap,
      roughness: 1,
      metalness: 0,
    })
    if (maps.emissiveMap) {
      mat.emissive = new THREE.Color('#ffffff')
      mat.emissiveMap = maps.emissiveMap
      mat.emissiveIntensity = def.type === 'hot' ? 1.5 : 1.1
    }
    attachEclipse(mat, eclCasters)
    return mat
  }, [def, maps, eclCasters])

  // volumetric hover highlight: a rim-scatter shell whose strength fades in
  const haloMaterial = useMemo(() => {
    const shell = 1.25
    const silhouetteCos = Math.sqrt(Math.max(1 - 1 / (shell * shell), 0.02))
    return new THREE.ShaderMaterial({
      vertexShader: atmosphereShader.vertexShader,
      fragmentShader: atmosphereShader.fragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(style.halo) },
        uStrength: { value: 0 },
        uInner: { value: 1 / silhouetteCos },
        uFalloff: { value: 2.4 },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [style.halo])

  const cloudMaterial = useMemo(() => {
    if (!maps?.cloudsMap) return null
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      alphaMap: maps.cloudsMap,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      metalness: 0,
    })
    attachEclipse(mat, eclCasters)
    return mat
  }, [maps, eclCasters])

  // LOD geometry set
  const geometries = useMemo(() => {
    const segs = def.radius > 5 ? [80, 40, 16] : [64, 32, 14]
    return segs.map((s) => new THREE.SphereGeometry(def.radius, s, Math.max(8, s / 2)))
  }, [def.radius])

  useEffect(() => register(def.id, anchorRef.current), [def.id])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])

  // texture LOD: bake a 2x resolution set in the background on first focus
  // (runs during the travel shot) and hot-swap it into the live materials
  useEffect(() => {
    if (!focused || def.type === 'gas') return
    let cancelled = false
    upgradePlanetTextures(def).then((hi) => {
      if (cancelled || !hi) return
      surfaceMaterial.map = hi.map
      surfaceMaterial.bumpMap = hi.bumpMap
      surfaceMaterial.roughnessMap = hi.roughnessMap
      if (hi.emissiveMap) surfaceMaterial.emissiveMap = hi.emissiveMap
      surfaceMaterial.needsUpdate = true
      if (hi.cloudsMap && cloudMaterial) {
        cloudMaterial.alphaMap = hi.cloudsMap
        cloudMaterial.needsUpdate = true
      }
    })
    return () => {
      cancelled = true
    }
  }, [focused, def, surfaceMaterial, cloudMaterial])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const a = def.orbitPhase + t * def.orbitSpeed
    anchorRef.current.position.set(
      Math.cos(a) * def.orbitRadius,
      0,
      Math.sin(a) * def.orbitRadius
    )
    if (spinRef.current) spinRef.current.rotation.y += def.spinSpeed * dt
    if (cloudRef.current) cloudRef.current.rotation.y += def.spinSpeed * 1.45 * dt
    if (surfaceMaterial.uniforms?.uTime) surfaceMaterial.uniforms.uTime.value = t

    // keep eclipse caster spheres synced to the live moon positions
    for (let i = 0; i < def.moons.length; i++) {
      if (getWorldPosition(def.moons[i].id, _eclPos)) {
        eclCasters[i].set(_eclPos.x, _eclPos.y, _eclPos.z, def.moons[i].radius)
      }
    }

    // hover highlight (volumetric rim shell)
    const st = useExperience.getState()
    const target = st.hoverId === def.id ? 0.5 : st.focusId === def.id ? 0.12 : 0
    const u = haloMaterial.uniforms.uStrength
    u.value = THREE.MathUtils.damp(u.value, target, 5, dt)

    // the generous hit sphere would swallow clicks meant for nearby moons, so
    // shrink it to the actual surface while this planet is the focus
    if (hitRef.current) hitRef.current.scale.setScalar(st.focusId === def.id ? 0.57 : 1)
  })

  const handleOver = (e) => {
    e.stopPropagation()
    const st = useExperience.getState()
    // hoverable from the overview AND from other planet/moon views (cross
    // navigation shortcut) — but not while it is itself the focus
    const ok =
      st.phase === 'system' ||
      ((st.phase === 'planet' || st.phase === 'moon') && st.focusId !== def.id)
    if (!ok) return
    setHover(def.id)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = () => {
    if (useExperience.getState().hoverId === def.id) setHover(null)
    document.body.style.cursor = 'auto'
  }
  const handleClick = (e) => {
    e.stopPropagation()
    if (e.delta > 6) return // was a camera drag, not a click
    const st = useExperience.getState()
    if (st.phase === 'loading' || st.phase === 'intro' || st.phase === 'travel') return
    if (st.phase === 'planet' && st.focusId === def.id) return
    focusPlanet(def.id)
  }

  return (
    <group rotation-x={def.inclination}>
      <OrbitLine
        radius={def.orbitRadius}
        color={ORBIT_COLOR}
        computeOpacity={(s) => {
          if (s.phase === 'loading' || s.phase === 'intro') return 0
          if (s.hoverId === def.id) return 0.5
          if (s.focusId === def.id) return 0.07
          if (s.phase === 'system') return 0.15
          return 0.04
        }}
      />

      <group ref={anchorRef}>
        <group rotation-z={def.axialTilt}>
          <group onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
            <Detailed distances={[0, 90, 200]}>
              {geometries.map((g, i) => (
                <mesh
                  key={i}
                  geometry={g}
                  material={surfaceMaterial}
                />
              ))}
            </Detailed>
            {/* generous invisible hit target for distant hovering */}
            <mesh ref={hitRef}>
              <sphereGeometry args={[def.radius * 1.8, 12, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>

          {cloudMaterial && (
            <mesh ref={cloudRef} material={cloudMaterial} raycast={() => null}>
              <sphereGeometry args={[def.radius * 1.03, 32, 16]} />
            </mesh>
          )}

          {def.rings && <Rings planetRadius={def.radius} />}
          <Atmosphere radius={def.radius} color={style.atmosphere} strength={ATMO_STRENGTH[def.type]} />
        </group>

        {/* volumetric hover highlight */}
        <mesh material={haloMaterial} scale={1.25} raycast={() => null}>
          <sphereGeometry args={[def.radius, 32, 16]} />
        </mesh>

        {hovered && !focused && (phase === 'system' || phase === 'planet' || phase === 'moon') && (
          <HoloLabel title={def.section.title} cta="Click to travel" />
        )}

        {def.moons.map((moon) => (
          <Moon key={moon.id} moon={moon} planetDef={def} />
        ))}
      </group>
    </group>
  )
}
