// Shared GLSL chunks + shader definitions for the sun, gas giants and
// atmospheric scattering shells. The sun sits at the world origin, so the
// light direction at any fragment is simply normalize(-worldPosition).

import { ECLIPSE_GLSL } from './eclipse'

export const GLSL_NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amp * snoise(p);
      p *= 2.04;
      amp *= 0.5;
    }
    return sum;
  }
`

const COMMON_VARYINGS = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
`

const COMMON_VERTEX = /* glsl */ `
  ${COMMON_VARYINGS}
  void main() {
    vObjPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

// ---------------------------------------------------------------------------
// Sun: churning plasma surface with limb darkening, HDR output for bloom
// ---------------------------------------------------------------------------
export const sunShader = {
  uniforms: {
    uTime: { value: 0 },
    uColorDeep: { value: null }, // THREE.Color set at material creation
    uColorMid: { value: null },
    uColorHot: { value: null },
  },
  vertexShader: COMMON_VERTEX,
  fragmentShader: /* glsl */ `
    ${COMMON_VARYINGS}
    uniform float uTime;
    uniform vec3 uColorDeep;
    uniform vec3 uColorMid;
    uniform vec3 uColorHot;
    ${GLSL_NOISE}

    void main() {
      vec3 p = normalize(vObjPos);
      float t = uTime * 0.04;

      float n1 = fbm(p * 2.6 + vec3(t, t * 0.65, -t * 0.5));
      float n2 = fbm(p * 6.5 + vec3(-t * 1.4, t * 0.9, t * 0.7) + n1);
      float v = clamp(0.5 + n1 * 0.55 + n2 * 0.35, 0.0, 1.0);

      vec3 col = mix(uColorDeep, uColorMid, smoothstep(0.12, 0.68, v));
      col = mix(col, uColorHot, smoothstep(0.7, 0.97, v));

      // limb darkening
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float center = clamp(dot(viewDir, normalize(vWorldNormal)), 0.0, 1.0);
      col *= 0.5 + 0.5 * pow(center, 0.6);

      gl_FragColor = vec4(col * 3.4, 1.0); // HDR for the bloom pass
    }
  `,
}

// ---------------------------------------------------------------------------
// Gas giant: animated banded atmosphere with storms and wrapped sun lighting.
// Moon eclipses come from the analytic sphere-shadow model (eclipse.js);
// the material needs an ECL_MAX define + uEclCasters/uEclCount uniforms.
// ---------------------------------------------------------------------------
export const gasGiantShader = {
  uniforms: {
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uColorA: { value: null },
    uColorB: { value: null },
    uColorC: { value: null },
    uColorStorm: { value: null },
  },
  vertexShader: COMMON_VERTEX,
  fragmentShader: /* glsl */ `
    ${COMMON_VARYINGS}
    uniform float uTime;
    uniform float uSeed;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    uniform vec3 uColorStorm;
    ${GLSL_NOISE}
    ${ECLIPSE_GLSL}

    void main() {
      vec3 p = normalize(vObjPos);
      float t = uTime * 0.014;

      // turbulence stretched along latitude lines -> flowing cloud bands
      float warp = fbm(p * vec3(2.2, 6.5, 2.2) + vec3(uSeed + t * 2.0, uSeed, -t));
      float warp2 = fbm(p * vec3(4.0, 11.0, 4.0) + vec3(-t * 1.6, uSeed * 1.7, t * 0.8));

      float bandsFine = sin(p.y * 22.0 + warp * 3.4 + uSeed) * 0.5 + 0.5;
      float bandsBroad = sin(p.y * 7.0 - warp * 2.2 + uSeed * 1.9) * 0.5 + 0.5;

      vec3 col = mix(uColorA, uColorB, bandsBroad);
      col = mix(col, uColorC, bandsFine * 0.55);
      col += warp2 * 0.06;

      // drifting storm cells
      float storm = fbm(p * 4.8 + vec3(uSeed * 3.1 - t * 2.6, 0.0, t * 1.4));
      col = mix(col, uColorStorm, smoothstep(0.48, 0.78, storm) * 0.4);

      // lighting: sun at world origin; moon eclipses attenuate the direct term
      // only, so the faint night-side/ambient floor is preserved
      float shadow = eclipseShadow(vWorldPos);
      vec3 sunDir = normalize(-vWorldPos);
      vec3 n = normalize(vWorldNormal);
      float wrap = clamp((dot(n, sunDir) + 0.18) / 1.18, 0.0, 1.0);
      float terminator = smoothstep(0.0, 0.35, wrap);
      col *= 0.025 + terminator * wrap * 1.25 * shadow;

      // soft forward-scatter rim on the day side
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float rim = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.0);
      col += uColorB * rim * wrap * 0.25 * shadow;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

// ---------------------------------------------------------------------------
// Atmosphere shell: rendered BackSide, brightest at the limb, lit by the sun
// ---------------------------------------------------------------------------
export const atmosphereShader = {
  uniforms: {
    uColor: { value: null },
    uStrength: { value: 1.0 },
    uInner: { value: 2.2 }, // 1 / cos(silhouette angle) for the shell scale
    uFalloff: { value: 1.9 },
  },
  vertexShader: COMMON_VERTEX,
  fragmentShader: /* glsl */ `
    ${COMMON_VARYINGS}
    uniform vec3 uColor;
    uniform float uStrength;
    uniform float uInner;
    uniform float uFalloff;

    void main() {
      vec3 n = normalize(vWorldNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float d = dot(viewDir, n); // ~0 at shell silhouette, negative inward
      float intensity = pow(clamp(-d * uInner, 0.0, 1.0), uFalloff);

      vec3 sunDir = normalize(-vWorldPos);
      float day = clamp(dot(n, sunDir) * 0.65 + 0.45, 0.04, 1.0);

      gl_FragColor = vec4(uColor * intensity * day * uStrength, intensity * day * uStrength);
    }
  `,
}
