// Cinematic camera rig.
//
// All camera motion flows through one state: a current position + look target
// pair. Travel between bodies is a gsap-eased parameter sweeping along a
// curved arc (never a straight zoom), while idle/follow modes use exponential
// damping for physically believable inertia. Because destinations are
// re-computed every frame from the live registry, the camera gracefully
// tracks planets that keep orbiting while it flies.

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { useFrame, useThree } from '@react-three/fiber'
import { useExperience } from '../store/useExperience'
import { getWorldPosition } from '../lib/registry'
import { PLANETS, PLANET_BY_ID, findMoon, SYSTEM_EXTENT } from '../config/solarSystem'

/** Live world-space point the depth-of-field should focus on. */
export const focusWorldPoint = new THREE.Vector3()

const UP = new THREE.Vector3(0, 1, 0)
const ORIGIN = new THREE.Vector3()
// framed from the actual system size so the outermost orbit always fits in
// view; a closer position + wider FOV keeps planets feeling near
const OVERVIEW_POS = new THREE.Vector3(0, SYSTEM_EXTENT * 0.75, SYSTEM_EXTENT * 1.55)
const INTRO_POS = new THREE.Vector3(-SYSTEM_EXTENT * 1.3, SYSTEM_EXTENT * 0.95, SYSTEM_EXTENT * 1.9)
const DRIFT = SYSTEM_EXTENT * 0.03
const OVERVIEW_FOV = 58

const _p = new THREE.Vector3()
const _m = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _side = new THREE.Vector3()
const _right = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _look = new THREE.Vector3()
const _off = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _c = new THREE.Vector3()

// near-shot backdrop azimuth, captured once per planet visit (relative to the
// planet's sun-line) so the framing rides the planet's orbit instead of
// chasing the other planets around frame-by-frame
const nearAim = { id: null, angle: 0 }

// per-shot FOV: near vistas go wide to hold the system in frame, far shots
// compress slightly for a sun-backdrop telephoto feel
const SHOT_FOV = { near: 58, mid: 45, far: 44 }

/** yaw: user drag rotation (radians) applied around the current subject */
function computeDesired(state, time, yaw, outPos, outTarget) {
  const { focusId, moonId } = state

  if (moonId) {
    const moon = findMoon(moonId)
    const planet = moon && PLANET_BY_ID[moon.planetId]
    if (moon && getWorldPosition(moonId, _m) && getWorldPosition(planet.id, _p)) {
      _dir.copy(_m).sub(_p).normalize() // planet -> moon: shoot from outside the orbit
      _off
        .copy(_dir)
        .multiplyScalar(moon.radius * 7.5)
        .addScaledVector(UP, moon.radius * 2.6)
        .applyAxisAngle(UP, yaw)
      outPos.copy(_m).add(_off)
      outTarget.copy(_m).addScaledVector(UP, -moon.radius * 0.7)
      focusWorldPoint.copy(_m)
      return
    }
  }

  if (focusId) {
    const def = PLANET_BY_ID[focusId]
    if (def && getWorldPosition(focusId, _p)) {
      _dir.copy(_p).normalize() // sun -> planet
      _side.crossVectors(UP, _dir).normalize()
      const d = def.viewDistance

      if (def.shot === 'near') {
        // inner planets: camera tucks in sunward-high so the planet centers
        // the frame with the outer system spread behind it. On arrival, swing
        // the backdrop toward the centroid of the other planets so most of
        // them share the frame; after that the angle is frozen relative to the
        // planet's sun-line, so the shot rides the planet's own orbit.
        if (nearAim.id !== focusId) {
          _aim.set(0, 0, 0)
          let n = 0
          for (const other of PLANETS) {
            if (other.id !== focusId && getWorldPosition(other.id, _c)) {
              _aim.add(_c)
              n++
            }
          }
          nearAim.id = focusId
          nearAim.angle = 0
          if (n) {
            _aim.divideScalar(n).sub(_p)
            _aim.y = 0
            if (_aim.lengthSq() > 1) {
              _aim.normalize()
              _c.copy(_dir).setY(0).normalize()
              // signed azimuth of the centroid around UP, biased outward
              const az = Math.atan2(_c.z * _aim.x - _c.x * _aim.z, _c.dot(_aim))
              nearAim.angle = THREE.MathUtils.clamp(az, -1.5, 1.5) * 0.65
            }
          }
        }
        _aim.copy(_dir).applyAxisAngle(UP, nearAim.angle)
        // pure rotation + lift: the offset length is constant, so the shot can
        // never degenerate into a top-down close-up at any orbit position
        _off
          .copy(_aim)
          .multiplyScalar(-d * 0.74)
          .addScaledVector(UP, d * 0.34)
          .applyAxisAngle(UP, yaw - 0.74)
        outPos.copy(_p).add(_off)
        // planet anchors the shot (panel bias keeps it just off-center)
        _fwd.copy(_p).sub(outPos).normalize()
        _right.crossVectors(_fwd, UP).normalize()
        outTarget.copy(_p).addScaledVector(_right, _off.length() * 0.17)
        focusWorldPoint.copy(_p)
        return
      }

      if (def.shot === 'far') {
        // outer planets: hang beyond the orbit and look back sunward — the
        // planet rim-lit in the foreground, sun and inner system as backdrop.
        // The -10° swing brings the sun in from the frame edge toward center.
        _off
          .copy(_dir)
          .multiplyScalar(d * 0.6)
          .addScaledVector(_side, d * 0.42)
          .addScaledVector(UP, d * 0.2)
          .applyAxisAngle(UP, yaw - Math.PI / 12)
        outPos.copy(_p).add(_off)
        // planet anchors the shot; from out here the sun lands in frame behind it
        _fwd.copy(_p).sub(outPos).normalize()
        _right.crossVectors(_fwd, UP).normalize()
        outTarget.copy(_p).addScaledVector(_right, _off.length() * 0.17)
        focusWorldPoint.copy(_p)
        return
      }

      // mid: sit sunward and off to the side — planet stays lit, classic shot
      _off
        .copy(_dir)
        .multiplyScalar(-d * 0.55)
        .addScaledVector(_side, d * 0.62)
        .addScaledVector(UP, d * 0.3)
        .applyAxisAngle(UP, yaw)
      outPos.copy(_p).add(_off)
      // push the planet off-center so the content panel has room. The bias is
      // angular (a fixed fraction of camera distance) so every shot type parks
      // the planet at the same screen position regardless of how close it is
      _fwd.copy(_p).sub(outPos).normalize()
      _right.crossVectors(_fwd, UP).normalize()
      outTarget.copy(_p).addScaledVector(_right, _off.length() * 0.17)
      focusWorldPoint.copy(_p)
      return
    }
  }

  // overview, with a slow idle drift so the frame never feels frozen
  nearAim.id = null // next planet visit re-frames against current positions
  outPos
    .set(
      OVERVIEW_POS.x + Math.sin(time * 0.05) * DRIFT,
      OVERVIEW_POS.y + Math.sin(time * 0.037) * DRIFT * 0.6,
      OVERVIEW_POS.z + Math.cos(time * 0.043) * DRIFT
    )
    .applyAxisAngle(UP, yaw)
  outTarget.copy(ORIGIN)
  focusWorldPoint.copy(ORIGIN)
}

export default function CameraDirector() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const r = useRef({
    pos: INTRO_POS.clone(),
    target: new THREE.Vector3(0, 0, 0),
    startPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    desiredPos: OVERVIEW_POS.clone(),
    desiredTarget: new THREE.Vector3(),
    arc: new THREE.Vector3(),
    parallax: new THREE.Vector2(),
    anim: { t: 1 },
    fov: { value: OVERVIEW_FOV },
    yaw: 0,
    yawTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    traveling: false,
    tween: null,
    fovTween: null,
  }).current

  // drag to rotate around the current subject (clicks are distinguished from
  // drags by the e.delta threshold in each body's onClick handler)
  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lastX = 0

    const onDown = (e) => {
      if (e.button !== 0) return
      dragging = true
      lastX = e.clientX
    }
    const onMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      lastX = e.clientX
      r.yawTarget -= dx * 0.005
    }
    const onUp = () => {
      dragging = false
    }
    // scroll to zoom (±20% of the default framing). Attached to the canvas
    // only, so scrolling inside HTML panels/modals never zooms the scene.
    const onWheel = (e) => {
      r.zoomTarget = THREE.MathUtils.clamp(
        r.zoomTarget * Math.exp(e.deltaY * 0.0007),
        0.8,
        1.2
      )
    }

    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl, r])

  useEffect(() => {
    const startTravel = (state) => {
      r.startPos.copy(r.pos)
      r.startTarget.copy(r.target)
      r.yawTarget = 0 // user rotation + zoom reset for each new shot
      r.zoomTarget = 1
      computeDesired(state, 0, 0, r.desiredPos, r.desiredTarget)

      const dist = r.startPos.distanceTo(r.desiredPos)
      const duration = THREE.MathUtils.clamp(0.6 + dist * 0.005, 0.9, 2.2)

      // lateral + vertical swing perpendicular to the flight path
      _dir.copy(r.desiredPos).sub(r.startPos).normalize()
      r.arc.crossVectors(_dir, UP)
      if (r.arc.lengthSq() < 0.01) r.arc.set(1, 0, 0)
      r.arc
        .normalize()
        .multiplyScalar(dist * (state.travelSeq % 2 ? 0.14 : -0.14))
        .addScaledVector(UP, dist * 0.06)

      r.tween?.kill()
      r.fovTween?.kill()
      r.anim.t = 0
      r.traveling = true
      r.tween = gsap.to(r.anim, {
        t: 1,
        duration,
        ease: 'power3.inOut',
        onComplete: () => {
          r.traveling = false
          useExperience.getState().arrive()
        },
      })
      const fovTarget = state.moonId
        ? 40
        : state.focusId
          ? (SHOT_FOV[PLANET_BY_ID[state.focusId]?.shot] ?? 45)
          : OVERVIEW_FOV
      r.fovTween = gsap.to(r.fov, { value: fovTarget, duration: duration * 0.9, ease: 'power2.inOut' })
    }

    const unsub = useExperience.subscribe((s, prev) => {
      if (s.travelSeq !== prev.travelSeq) startTravel(s)
    })
    return () => {
      unsub()
      r.tween?.kill()
      r.fovTween?.kill()
    }
  }, [r])

  useFrame((state, dt) => {
    const st = useExperience.getState()
    const time = state.clock.elapsedTime

    r.yaw = THREE.MathUtils.damp(r.yaw, r.yawTarget, 5, dt)
    r.zoom = THREE.MathUtils.damp(r.zoom, r.zoomTarget, 6, dt)

    if (st.phase !== 'loading') {
      computeDesired(st, time, r.yaw, r.desiredPos, r.desiredTarget)
      // user zoom scales the camera's offset from the current subject
      _off.copy(r.desiredPos).sub(r.desiredTarget).multiplyScalar(r.zoom)
      r.desiredPos.copy(r.desiredTarget).add(_off)
    }

    if (r.traveling) {
      const t = r.anim.t
      r.pos.lerpVectors(r.startPos, r.desiredPos, t).addScaledVector(r.arc, Math.sin(t * Math.PI))
      const tt = t * t * (3 - 2 * t) // target pans slightly behind position
      r.target.lerpVectors(r.startTarget, r.desiredTarget, tt)
    } else if (st.phase !== 'loading') {
      // inertial follow of (possibly orbiting) destination
      r.pos.x = THREE.MathUtils.damp(r.pos.x, r.desiredPos.x, 5, dt)
      r.pos.y = THREE.MathUtils.damp(r.pos.y, r.desiredPos.y, 5, dt)
      r.pos.z = THREE.MathUtils.damp(r.pos.z, r.desiredPos.z, 5, dt)
      r.target.x = THREE.MathUtils.damp(r.target.x, r.desiredTarget.x, 6.5, dt)
      r.target.y = THREE.MathUtils.damp(r.target.y, r.desiredTarget.y, 6.5, dt)
      r.target.z = THREE.MathUtils.damp(r.target.z, r.desiredTarget.z, 6.5, dt)
    }

    // mouse parallax — constant *angular* sway: the world offset scales with
    // camera distance so close-in shots (small outer planets) don't get their
    // subject swung off-frame by the mouse
    const pDist = r.pos.distanceTo(r.target)
    const pScale = pDist * (st.moonId ? 0.14 : st.focusId ? 0.032 : 0.019)
    r.parallax.x = THREE.MathUtils.damp(r.parallax.x, state.pointer.x, 2.5, dt)
    r.parallax.y = THREE.MathUtils.damp(r.parallax.y, state.pointer.y, 2.5, dt)

    _fwd.copy(r.target).sub(r.pos).normalize()
    _right.crossVectors(_fwd, UP).normalize()
    _look
      .copy(r.target)
      .addScaledVector(_right, r.parallax.x * pScale)
      .addScaledVector(UP, r.parallax.y * pScale * 0.65)

    camera.position.copy(r.pos)
    camera.lookAt(_look)
    if (Math.abs(camera.fov - r.fov.value) > 0.01) {
      camera.fov = r.fov.value
      camera.updateProjectionMatrix()
    }
  })

  return null
}
