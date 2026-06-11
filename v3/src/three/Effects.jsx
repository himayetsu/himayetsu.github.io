// Post-processing pipeline: god rays from the sun, HDR bloom, focus-tracking
// depth of field, subtle chromatic aberration, vignette and a final ACES
// filmic tone map (the canvas itself renders in linear HDR).

import { useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  GodRays,
  Vignette,
  ChromaticAberration,
  SMAA,
  ToneMapping,
  BrightnessContrast,
} from '@react-three/postprocessing'
import { ToneMappingMode, BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { useExperience } from '../store/useExperience'
import { focusWorldPoint } from './CameraDirector'
import { PLANET_BY_ID, SYSTEM_EXTENT } from '../config/solarSystem'

/**
 * Depth-masked god ray composite.
 *
 * The stock GodRays effect smears radial streaks over *everything*, including
 * objects in front of the sun. Instead of a costly volumetric pass we use the
 * screen-space shortcut: the GodRays effect only renders its ray texture
 * (blend = SKIP), and this effect composites it masked by the depth buffer —
 * rays only appear on pixels at or beyond the sun's distance, so foreground
 * planets clip them at their silhouette. Cost: one texture fetch per pixel.
 */
const occludedRaysFrag = /* glsl */ `
  uniform sampler2D uRays;
  uniform float uSunDist;

  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    float dist = -getViewZ(depth);
    // show rays on the sun disc itself and anything at/behind it; fade out
    // across a band so the cut isn't a hard line
    float mask = smoothstep(uSunDist - 24.0, uSunDist - 11.0, dist);
    vec3 rays = texture2D(uRays, uv).rgb * mask;
    outputColor = vec4(inputColor.rgb + rays, inputColor.a);
  }
`

class OccludedGodRaysEffect extends Effect {
  constructor() {
    super('OccludedGodRaysEffect', occludedRaysFrag, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uRays', new THREE.Uniform(null)],
        ['uSunDist', new THREE.Uniform(300)],
      ]),
    })
  }
}

export default function Effects() {
  const sunMesh = useExperience((s) => s.sunMesh)
  const dofRef = useRef()
  const godRaysRef = useRef()
  const [occludedRays] = useState(() => new OccludedGodRaysEffect())

  useFrame((state, dt) => {
    const st = useExperience.getState()

    const dof = dofRef.current
    if (dof) {
      dof.target = focusWorldPoint
      // overview: effectively no blur — everything crisp; close-ups: subtle
      // bokeh. Near-planet vistas frame the whole system behind the subject,
      // so they stay almost deep-focus to keep the other planets readable.
      const shot = st.focusId ? PLANET_BY_ID[st.focusId]?.shot : null
      const targetScale = st.moonId ? 1.6 : shot === 'near' ? 0.35 : st.focusId ? 1.1 : 0.0
      dof.bokehScale = THREE.MathUtils.damp(dof.bokehScale, targetScale, 1.8, dt)
    }

    const gr = godRaysRef.current
    if (gr) {
      // camera.position is always absolute world-space (never planet-relative)
      // and the sun sits at the world origin, so this is the camera->sun
      // distance in every view
      const dist = state.camera.position.length()
      occludedRays.uniforms.get('uRays').value = gr.texture
      occludedRays.uniforms.get('uSunDist').value = dist

      // constant *apparent* sun intensity: the further the camera, the smaller
      // the sun disc on screen, so ray strength rises monotonically with
      // distance to compensate (and vice versa up close). Set directly each
      // frame — no damping — so it tracks the camera exactly and never feels
      // velocity-dependent.
      //
      // Tuning anchors — [weight, exposure] at three distance ranges:
      const NEAR = [0.18, 0.28] // sun close-ups / innermost planet views
      const MID = [0.2, 0.3] // outer planet views
      const FAR = [0.23, 0.33] // home overview
      // a ramps across the planet-view range, b ramps up to the overview
      const a = THREE.MathUtils.smoothstep(dist, 25, SYSTEM_EXTENT * 0.9)
      const b = THREE.MathUtils.smoothstep(dist, SYSTEM_EXTENT, SYSTEM_EXTENT * 1.55)
      const u = gr.godRaysMaterial.uniforms
      u.weight.value = THREE.MathUtils.lerp(THREE.MathUtils.lerp(NEAR[0], MID[0], a), FAR[0], b)
      u.exposure.value = THREE.MathUtils.lerp(THREE.MathUtils.lerp(NEAR[1], MID[1], a), FAR[1], b)
    }
  })

  // NOTE: all color grading must come AFTER tone mapping — grading HDR values
  // can push channels negative, which the ACES curve turns into NaN (black
  // speckle on the sun).
  return (
    <EffectComposer multisampling={0}>
      {/* renders the ray texture only; compositing happens depth-masked below */}
      {sunMesh && (
        <GodRays
          ref={godRaysRef}
          sun={sunMesh}
          blendFunction={BlendFunction.SKIP}
          samples={36}
          density={0.92}
          decay={0.92}
          weight={0.2}
          exposure={0.15}
          clampMax={1}
          blur
        />
      )}
      <Bloom mipmapBlur intensity={1.05} luminanceThreshold={1.0} luminanceSmoothing={0.3} />
      {/* full-resolution DoF with a wide in-focus band: the subject and its
          surroundings stay tack sharp, only far background softens */}
      <DepthOfField
        ref={dofRef}
        focalLength={0.06}
        bokehScale={0}
        worldFocusRange={60}
        target={[0, 0, 0]}
      />
      {/* rays composite AFTER DoF so the distant sun's streaks stay crisp in
          planet views (the far background is what DoF blurs the most) */}
      {sunMesh && <primitive object={occludedRays} />}
      <ChromaticAberration offset={[0.0004, 0.0003]} radialModulation modulationOffset={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast brightness={0.01} contrast={0.07} />
      <Vignette eskil={false} offset={0.16} darkness={0.78} />
      <SMAA />
    </EffectComposer>
  )
}
