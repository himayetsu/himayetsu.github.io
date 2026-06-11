// Analytic spherical eclipse shadows.
//
// Every shadow caster in this scene is a sphere with a known position and
// radius, and the only light is the sun (a disc of known size at the origin).
// So instead of shadow maps we compute the umbra/penumbra cone analytically
// per fragment: compare the occluder's angular radius against the sun's
// angular radius and their angular separation. This gives a physically
// correct conical gradient — a small moon far from the surface only ever
// covers a sliver of the huge sun disc, so its shadow is a faint wide smudge,
// while a close caster produces a sharp dark core. No shadow map, no acne,
// no resolution limits; cost is a few dot products per caster.

import { ShaderChunk } from 'three'
import { SUN_RADIUS } from '../../config/solarSystem'

/** GLSL: uniforms + eclipseShadow(worldPos). Requires define ECL_MAX. */
export const ECLIPSE_GLSL = /* glsl */ `
  uniform vec4 uEclCasters[ ECL_MAX ]; // xyz: world position, w: radius
  uniform int uEclCount;

  float eclipseShadow( vec3 p ) {
    float dSun = length( p );
    vec3 rd = -p / dSun; // fragment -> sun
    float angSun = ${SUN_RADIUS.toFixed(1)} / dSun;
    float light = 1.0;
    for ( int i = 0; i < ECL_MAX; i ++ ) {
      if ( i >= uEclCount ) break;
      vec3 oc = uEclCasters[ i ].xyz - p;
      float t = dot( oc, rd );
      if ( t <= 0.0 ) continue; // caster is not between fragment and sun
      float angOcc = uEclCasters[ i ].w / t;
      float angSep = length( oc - rd * t ) / t;
      // fraction of the sun disc left visible: full umbra when the occluder
      // disc swallows the sun disc, smooth penumbra ramp across the overlap
      light *= smoothstep( angOcc - angSun, angOcc + angSun, angSep );
    }
    // never crush to pure black so surface texture stays readable
    return mix( 0.1, 1.0, light );
  }
`

/**
 * Wire analytic eclipse shadows into a MeshStandardMaterial.
 * casters: array of THREE.Vector4 (world position xyz, radius w) — update
 * them per frame; uploads automatically.
 */
export function attachEclipse(material, casters) {
  if (!casters.length) return
  material.defines = { ...material.defines, ECL_MAX: casters.length }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEclCasters = { value: casters }
    shader.uniforms.uEclCount = { value: casters.length }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEclWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n\tvEclWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
      )
    // onBeforeCompile sees the *unexpanded* template — the point-light loop
    // we need to patch lives inside the lights_fragment_begin chunk, so
    // expand that one include ourselves and patch the expansion
    const lightsChunk = ShaderChunk.lights_fragment_begin.replace(
      'getPointLightInfo( pointLight, geometryPosition, directLight );',
      'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= eclipseShadow( vEclWorldPos );'
    )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEclWorldPos;\n' + ECLIPSE_GLSL)
      .replace('#include <lights_fragment_begin>', lightsChunk)
  }
  // distinct programs per caster count
  material.customProgramCacheKey = () => `eclipse-${casters.length}`
}
