import * as THREE from 'three';

// Standard sRGB-managed pipeline (three's default): colour textures are decoded
// from sRGB to linear, lit in linear, then the framebuffer is sRGB-encoded on
// output. This gamma lift is what gives the designs their bright, natural look
// (e.g. Mars reads as bright orange, not dark blood-red). Colour textures load
// with SRGBColorSpace; data maps (water, bump) stay linear — see loadTex below.

// Dashboard background scene. Every planet is ported from the user's own
// Claude-design set (Planets.zip) — one hand-tuned shader per body:
//   • Earth  — day/night terminator, ocean sun-glint, cloud shell, cyan atmosphere
//   • Moon   — airless maria/highland remap, harsh terminator
//   • Mars   — bump-mapped relief, dusty butterscotch rim
//   • Jupiter— turbulent fbm band-swirl, limb darkening
//   • Saturn — gas bands + fully procedural ring system (Cassini division, named gaps)
//   • Neptune— methane-azure recolor, Great Dark Spot, filmic tonemap
// All share one backdrop (night-sky sphere, procedural Milky Way, glinting stars,
// shooting stars). The active planet is chosen per nav tab and crossfades on change.
//
// Textures live in public/textures/ (see README there). They ship with the
// project, so the scene is photoreal by default.

export type Planet = 'earth' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'neptune';

const ROTATION_PERIOD_S = 120; // one slow west→east turn — subtle, seamless
const MAX_FPS = 30;
// Respect Vite's base path (e.g. "/caesar0dte/" on GitHub Pages) so texture URLs
// resolve under the deployed sub-path instead of the domain root. BASE_URL ends
// with a slash, so we don't add a leading one after it.
const TEX = (f: string) => `${import.meta.env.BASE_URL}textures/${f}`;

// Sun key-light from the right, slightly behind — the design's "deep space at
// night" crescent on the eastern limb (this is the value the user tuned every
// planet around in Planets.zip).
const SUN_DIR = new THREE.Vector3(0.92, 0.12, -0.33).normalize();

// Baked backdrop look (from the design's tweak defaults: violet nebula, bright stars)
const NEBULA = 1.1;
const NEBULA_BLUE_W = 0.3;
const NEBULA_VIOLET_W = 1.6;
const STAR_BRIGHTNESS = 1.45;

// deterministic RNG so the starfield / meteors are identical every load
function mulberry(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Shaders (ported from Planets.zip)
// ---------------------------------------------------------------------------

const SURFACE_VERT = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D waterMap;
  uniform vec3 sunDir;
  uniform vec3 camPos;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(camPos - vPosW);
    float ndl = dot(N, sunDir);
    float dayAmt = smoothstep(-0.02, 0.18, ndl);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 nightTex = texture2D(nightMap, vUv).rgb;
    float water = texture2D(waterMap, vUv).r;
    float lum = dot(nightTex, vec3(0.35, 0.45, 0.2));
    float lmask = smoothstep(0.07, 0.58, lum);
    vec3 lights = vec3(1.0, 0.68, 0.38) * lmask * 2.3;
    lights *= (1.0 - dayAmt * 0.96);
    vec3 dayCol = day * (2.6 * max(ndl, 0.0)); // brighter daylit face
    vec3 Hv = normalize(sunDir + V);
    float spec = pow(max(dot(N, Hv), 0.0), 110.0) * water * dayAmt * 0.6;
    vec3 col = dayCol * dayAmt + lights + spec * vec3(1.0, 0.95, 0.85);
    col += day * vec3(0.10, 0.16, 0.28) * 0.14 * (1.0 - dayAmt); // stronger earthshine fill
    float term = smoothstep(0.0, 0.10, ndl) * (1.0 - smoothstep(0.10, 0.34, ndl));
    col += term * day * vec3(0.95, 0.5, 0.22) * 0.22;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.5);
    float litRim = 0.14 + 0.86 * smoothstep(-0.3, 0.5, ndl);
    col += vec3(0.34, 0.6, 1.0) * fres * litRim * 0.55;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const MOON_FRAG = `
  uniform sampler2D dayMap;
  uniform vec3 sunDir;
  uniform float uDetail;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    float ndl = dot(N, sunDir);
    // mip-bias lookups pull the large-scale maria layout out of the map (the
    // moon texture is loaded with anisotropy 1 so these LOD biases are honoured
    // rather than overridden by anisotropic filtering).
    float big = dot(texture2D(dayMap, vUv, 3.2).rgb, vec3(0.299, 0.587, 0.114));
    float mid = dot(texture2D(dayMap, vUv, 2.3).rgb, vec3(0.299, 0.587, 0.114));
    float high = smoothstep(0.28, 0.48, big);
    vec3 tex = mix(vec3(0.385, 0.39, 0.40), vec3(0.64, 0.64, 0.64), high);
    tex *= 1.0 + (mid - big) * (0.35 + 1.4 * uDetail);
    float lit = max(ndl, 0.0);
    vec3 col = tex * lit * 1.5 * vec3(1.0, 0.97, 0.92);
    col += tex * 0.05 * vec3(0.55, 0.65, 0.85);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const MARS_FRAG = `
  uniform sampler2D dayMap;
  uniform sampler2D bumpMap;
  uniform vec3 sunDir;
  uniform vec3 camPos;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(camPos - vPosW);
    vec2 eps = vec2(1.0 / 1024.0, 1.0 / 512.0);
    float h  = texture2D(bumpMap, vUv).r;
    float hx = texture2D(bumpMap, vUv + vec2(eps.x, 0.0)).r;
    float hy = texture2D(bumpMap, vUv + vec2(0.0, eps.y)).r;
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 B = normalize(cross(N, T));
    vec3 Nb = normalize(N - (T * (hx - h) + B * (hy - h)) * 16.0);
    float ndl = dot(Nb, sunDir);
    float ndlS = dot(N, sunDir);
    float dayAmt = smoothstep(-0.02, 0.18, ndlS);
    vec3 day = texture2D(dayMap, vUv).rgb;
    day = pow(day, vec3(1.15)) * 1.12;
    day *= 0.72 + 0.55 * h;
    float g = fract(sin(dot(floor(vUv * vec2(2600.0, 1300.0)), vec2(12.9898, 78.233))) * 43758.5453);
    day *= 0.95 + 0.10 * g;
    vec3 dayCol = day * (1.75 * max(ndl, 0.0));
    vec3 col = dayCol * dayAmt;
    col += day * vec3(0.30, 0.24, 0.20) * 0.08 * (1.0 - dayAmt);
    float term = smoothstep(0.0, 0.10, ndlS) * (1.0 - smoothstep(0.10, 0.34, ndlS));
    col += term * day * vec3(1.0, 0.55, 0.25) * 0.28;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.5);
    float litRim = 0.14 + 0.86 * smoothstep(-0.3, 0.5, ndlS);
    col += vec3(0.9, 0.6, 0.38) * fres * litRim * 0.35;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const JUPITER_FRAG = `
  uniform sampler2D dayMap;
  uniform vec3 sunDir;
  uniform vec3 camPos;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.13 + 11.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(camPos - vPosW);
    float ndl = dot(N, sunDir);
    float dayAmt = smoothstep(-0.02, 0.18, ndl);
    float sw = fbm(vec2(vUv.x * 42.0, vUv.y * 150.0));
    float sw2 = fbm(vec2(vUv.x * 84.0, vUv.y * 84.0) + 7.3);
    vec2 uv2 = vUv + vec2((sw - 0.5) * 0.0065, (sw2 - 0.5) * 0.003);
    vec3 day = texture2D(dayMap, uv2).rgb;
    day = pow(day, vec3(1.18)) * 1.04;
    float lum = dot(day, vec3(0.299, 0.587, 0.114));
    day = mix(vec3(lum), day, 1.15);
    day *= vec3(0.94, 1.0, 1.05);
    float streak = fbm(vec2(vUv.x * 28.0, vUv.y * 260.0));
    day *= 0.86 + 0.28 * streak;
    float mu = max(dot(N, V), 0.0);
    float limb = 0.3 + 0.7 * pow(mu, 0.5);
    vec3 dayCol = day * (1.7 * max(ndl, 0.0)) * limb;
    vec3 col = dayCol * dayAmt;
    col += day * vec3(0.28, 0.26, 0.24) * 0.08 * (1.0 - dayAmt);
    float term = smoothstep(0.0, 0.10, ndl) * (1.0 - smoothstep(0.10, 0.34, ndl));
    col += term * day * vec3(1.0, 0.78, 0.52) * 0.22;
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.5);
    float litRim = 0.14 + 0.86 * smoothstep(-0.3, 0.5, ndl);
    col += vec3(0.9, 0.82, 0.66) * fres * litRim * 0.34;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const SATURN_FRAG = `
  uniform sampler2D dayMap;
  uniform vec3 sunDir;
  uniform vec3 camPos;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.13 + 11.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(camPos - vPosW);
    float ndl = dot(N, sunDir);
    float dayAmt = smoothstep(-0.02, 0.18, ndl);
    vec3 day = texture2D(dayMap, vUv).rgb;
    day = pow(day, vec3(1.12)) * 1.12;
    float lum = dot(day, vec3(0.299, 0.587, 0.114));
    day = mix(vec3(lum), day, 1.25);
    float streak = fbm(vec2(vUv.x * 22.0, vUv.y * 220.0));
    day *= 0.92 + 0.16 * streak;
    float mu = max(dot(N, V), 0.0);
    float limb = 0.32 + 0.68 * pow(mu, 0.5);
    vec3 dayCol = day * (1.85 * max(ndl, 0.0)) * limb;
    vec3 col = dayCol * dayAmt;
    col += day * vec3(0.30, 0.28, 0.24) * 0.07 * (1.0 - dayAmt);
    float term = smoothstep(0.0, 0.10, ndl) * (1.0 - smoothstep(0.10, 0.34, ndl));
    col += term * day * vec3(1.0, 0.75, 0.45) * 0.24;
    float fres = pow(1.0 - mu, 4.5);
    float litRim = 0.14 + 0.86 * smoothstep(-0.3, 0.5, ndl);
    col += vec3(0.95, 0.85, 0.62) * fres * litRim * 0.38;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const NEPTUNE_FRAG = `
  uniform sampler2D dayMap;
  uniform vec3 sunDir;
  uniform vec3 camPos;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.13 + 11.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(camPos - vPosW);
    float ndl = dot(N, sunDir);
    float dayAmt = smoothstep(-0.02, 0.18, ndl);
    vec3 day = texture2D(dayMap, vUv).rgb;
    float l0 = lum(day);
    vec3 deep = vec3(0.03, 0.10, 0.36);
    vec3 midc = vec3(0.10, 0.28, 0.74);
    vec3 high = vec3(0.45, 0.65, 0.98);
    day = mix(deep, midc, smoothstep(0.10, 0.65, l0));
    day = mix(day, high, smoothstep(0.88, 1.0, l0) * 0.6);
    float bnd = fbm(vec2(vUv.y * 26.0, vUv.y * 26.0));
    day *= 0.94 + 0.10 * bnd;
    float streakN = pow(1.0 - abs(2.0 * fbm(vec2(vUv.x * 9.0, vUv.y * 60.0)) - 1.0), 7.0);
    float latMask = exp(-pow((vUv.y - 0.33) * 16.0, 2.0)) + 0.7 * exp(-pow((vUv.y - 0.62) * 20.0, 2.0));
    float cirrus = streakN * latMask;
    day = mix(day, vec3(0.85, 0.93, 1.0), clamp(cirrus * 0.5, 0.0, 1.0));
    vec2 sc = vec2(0.30, 0.42);
    vec2 sd = (vUv - sc) * vec2(7.5, 13.0);
    float spot = exp(-dot(sd, sd));
    day *= 1.0 - 0.42 * spot;
    float hood = exp(-dot(sd - vec2(0.0, -0.9), sd - vec2(0.0, -0.9))) * 0.5;
    day = mix(day, vec3(0.85, 0.93, 1.0), hood * 0.5);
    float mu = max(dot(N, V), 0.0);
    float limb = 0.22 + 0.78 * pow(mu, 0.6);
    vec3 dayCol = day * (1.9 * max(ndl, 0.0)) * limb;
    vec3 col = dayCol * dayAmt;
    col += day * vec3(0.22, 0.28, 0.40) * 0.09 * (1.0 - dayAmt);
    float term = smoothstep(0.0, 0.10, ndl) * (1.0 - smoothstep(0.10, 0.34, ndl));
    col += term * day * vec3(0.5, 0.75, 1.0) * 0.30;
    float fres = pow(1.0 - mu, 4.0);
    float litRim = 0.16 + 0.84 * smoothstep(-0.3, 0.5, ndl);
    col += vec3(0.35, 0.6, 1.0) * fres * litRim * 0.6;
    col = aces(col * 0.95);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const GLOW_VERT = `
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = `
  uniform vec3 sunDir;
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uOpacity;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    float rim = pow(clamp(0.62 - dot(normalize(vNormalV), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 6.5);
    float lit = 0.22 + 0.78 * smoothstep(-0.45, 0.55, dot(normalize(vNormalW), sunDir));
    gl_FragColor = vec4(uColor * rim * lit * uStrength, rim * lit * uOpacity);
  }
`;

// Saturn ring system — procedural radial profile (real band structure)
const RING_VERT = `
  varying vec2 vUv;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RING_FRAG = `
  uniform vec3 sunDir;
  uniform vec3 uPlanet;
  uniform float uPR;
  uniform float uDetail;
  uniform float uBright;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vPosW;
  float hash1(float p) { return fract(sin(p * 127.1) * 43758.5453); }
  float vnoise1(float p) {
    float i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), f);
  }
  float fbm1(float p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise1(p); p = p * 2.17 + 13.7; a *= 0.55; }
    return v;
  }
  float band(float x, float a, float b, float e) {
    return smoothstep(a - e, a + e, x) * (1.0 - smoothstep(b - e, b + e, x));
  }
  float gapAt(float x, float c, float w, float e) {
    return 1.0 - band(x, c - w, c + w, e);
  }
  void main() {
    float R = mix(1.24, 2.27, vUv.x);
    float px = fwidth(R) + 1e-5;
    float e = max(0.002, px);
    float cRing = band(R, 1.243, 1.526, e) * (0.17 + 0.13 * smoothstep(1.32, 1.52, R));
    float bRing = band(R, 1.526, 1.950, e) * 0.97;
    float aRing = band(R, 2.027, 2.262, e) * (0.74 - 0.12 * smoothstep(2.03, 2.26, R));
    float casDiv = band(R, 1.950, 2.027, e) * 0.05;
    float d = cRing + bRing + aRing + casDiv;
    float u1 = fbm1(R * 27.0);
    d *= 0.90 + 0.20 * u1;
    float f1 = fbm1(R * 160.0);
    float f2 = vnoise1(R * 430.0);
    float att1 = exp(-pow(px * 160.0, 1.3));
    float att2 = exp(-pow(px * 430.0, 1.3));
    d *= clamp(1.0 + uDetail * ((f1 - 0.5) * 0.62 * att1 + (f2 - 0.5) * 0.38 * att2), 0.0, 2.0);
    d *= gapAt(R, 1.290, 0.003, e);
    d *= gapAt(R, 1.452, 0.0045, e);
    d *= gapAt(R, 2.214, 0.005, e);
    d *= gapAt(R, 2.2645, 0.0012, e);
    d += band(R, 1.959, 1.963, e) * 0.28;
    vec3 alb = vec3(0.48, 0.43, 0.37);
    alb = mix(alb, vec3(0.94, 0.85, 0.67), band(R, 1.526, 1.950, 0.02));
    alb = mix(alb, vec3(0.87, 0.80, 0.66), smoothstep(2.00, 2.05, R));
    alb *= 0.88 + 0.24 * f1;
    vec3 rel = vPosW - uPlanet;
    float along = dot(rel, sunDir);
    float perp = length(rel - sunDir * along);
    float shadow = 1.0 - (1.0 - smoothstep(uPR * 0.98, uPR * 1.12, perp)) * (1.0 - step(0.0, along));
    float sunSide = clamp(dot(normalize(rel), sunDir) * 0.5 + 0.5, 0.0, 1.0);
    float light = (0.10 + 1.15 * pow(sunSide, 1.7)) * shadow;
    vec3 col = alb * vec3(1.0, 0.94, 0.82) * light * uBright;
    gl_FragColor = vec4(col, clamp(d, 0.0, 1.0) * uOpacity);
  }
`;

const STAR_VERT = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aFreq;
  uniform float uT;
  varying float vA;
  void main() {
    float tw = sin(6.28318 * aFreq * uT + aPhase);
    vA = 0.72 + 0.28 * tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.9 + 0.14 * tw);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = `
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p);
    float core = exp(-d * d * 7.0);
    float flare = exp(-abs(p.x) * 9.0) * exp(-abs(p.y) * 2.2) * 0.55
                + exp(-abs(p.y) * 9.0) * exp(-abs(p.x) * 2.2) * 0.55;
    float a = clamp(core + flare, 0.0, 1.0) * vA;
    gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * a, a);
  }
`;

const MW_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MW_FRAG = `
  uniform vec3 nrm;
  uniform float uNeb;
  uniform float uBlueW;
  uniform float uVioletW;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.13 + 11.7; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 d = normalize(vDir);
    float dist = dot(d, nrm);
    vec3 t1 = normalize(cross(nrm, vec3(0.0, 0.0, 1.0)));
    vec3 t2 = cross(nrm, t1);
    float u = atan(dot(d, t2), dot(d, t1));
    vec2 q = vec2(u * 7.0, dist * 18.0);
    float n1 = fbm(q);
    float n2 = fbm(q * 2.1 + 31.4);
    float spotC = exp(-pow((u - 1.50) * 2.2, 2.0)) * exp(-pow((dist - 0.02) * 3.8, 2.0));
    float spotV = exp(-pow((u - 1.02) * 2.6, 2.0)) * exp(-pow((dist - 0.10) * 3.2, 2.0));
    float ridge = 1.0 - abs(2.0 * n1 - 1.0);
    float fil = pow(ridge, 3.5) * smoothstep(0.3, 0.7, n2);
    vec3 blue = mix(vec3(0.08, 0.20, 0.48), vec3(0.40, 0.58, 0.92), n2);
    vec3 col = blue * fil * spotC * 0.62 * uBlueW;
    float n3 = fbm(q * 1.3 + vec2(17.0, 3.0));
    float violet = smoothstep(0.45, 0.8, n3);
    col += vec3(0.44, 0.30, 0.60) * violet * n1 * spotV * 0.5 * uVioletW;
    col += vec3(0.06, 0.10, 0.24) * exp(-pow(dist * 2.0, 2.0)) * n2 * 0.10;
    gl_FragColor = vec4(col * uNeb, 1.0);
  }
`;

const METEOR_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const METEOR_FRAG = `
  uniform float uA;
  varying vec2 vUv;
  void main() {
    float g = pow(vUv.x, 1.6);
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float a = g * across * uA;
    gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * a, a);
  }
`;

// ---------------------------------------------------------------------------

export interface SceneApi {
  setPlanet: (p: Planet) => void;
  destroy: () => void;
}

interface Meteor {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  start: number; dur: number;
  x0: number; y0: number; dx: number; dy: number; travel: number;
}

interface Spin { spin: THREE.Object3D; clouds?: THREE.Object3D }

export function createPlanetScene(canvas: HTMLCanvasElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const lowEnd = (navigator.hardwareConcurrency ?? 4) <= 4;
  renderer.setPixelRatio(lowEnd ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace; // sRGB-encode output (three's default) — bright, natural planets

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(0, 0, 3.4);
  camera.lookAt(0, 0, 0);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---- texture loading (missing files just don't apply) --------------------
  const texLoader = new THREE.TextureLoader();
  function loadTex(file: string, srgb: boolean, aniso = Math.min(8, maxAniso)) {
    const t = texLoader.load(TEX(file), () => { needsRender = true; });
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    return t;
  }

  // ---- shared backdrop (built once) ----------------------------------------
  const skyMat = new THREE.MeshBasicMaterial({
    map: loadTex('night_sky.png', true),
    side: THREE.BackSide,
  });
  skyMat.color.setScalar(STAR_BRIGHTNESS);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 48), skyMat);
  sky.rotation.set(0.35, 2.6, 0.55);
  scene.add(sky);

  const mwNormal = new THREE.Vector3(-Math.sin(0.62), Math.cos(0.62), 0).normalize();
  const mwMat = new THREE.ShaderMaterial({
    vertexShader: MW_VERT, fragmentShader: MW_FRAG,
    uniforms: {
      nrm: { value: mwNormal },
      uNeb: { value: NEBULA },
      uBlueW: { value: NEBULA_BLUE_W },
      uVioletW: { value: NEBULA_VIOLET_W },
    },
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(78, 48, 48), mwMat));

  // glinting foreground stars, biased to the open right side
  const COUNT = 22;
  const pos = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  const freqs = new Float32Array(COUNT);
  const rng = mulberry(7);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (rng() * 2 - 0.55) * 34;
    pos[i * 3 + 1] = (rng() * 2 - 1) * 20;
    pos[i * 3 + 2] = -60;
    sizes[i] = 7 + Math.pow(rng(), 2.2) * 34;
    phases[i] = rng() * 6.28318;
    freqs[i] = 2 + Math.floor(rng() * 5);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  starGeo.setAttribute('aFreq', new THREE.BufferAttribute(freqs, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms: { uT: { value: 0 } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // shooting stars
  const meteors: Meteor[] = [];
  const mrng = mulberry(1234);
  for (let mi = 0; mi < 16; mi++) {
    const ang = -0.55 - (mrng() - 0.5) * 0.5;
    const mmat = new THREE.ShaderMaterial({
      vertexShader: METEOR_VERT, fragmentShader: METEOR_FRAG,
      uniforms: { uA: { value: 0 } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(3.0 + mrng() * 2.5, 0.22), mmat);
    mm.rotation.z = ang;
    mm.visible = false;
    scene.add(mm);
    meteors.push({
      mesh: mm, mat: mmat,
      start: mi * 7.5 + mrng() * 4.0,
      dur: 0.9 + mrng() * 0.7,
      x0: -6 + mrng() * 40, y0: -12 + mrng() * 30,
      dx: Math.cos(ang), dy: Math.sin(ang),
      travel: 9 + mrng() * 8,
    });
  }

  // sun light for Earth's cloud shell (the surface shaders light themselves)
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sunLight.position.copy(SUN_DIR).multiplyScalar(10);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x334455, 0.35));

  // ---- planets --------------------------------------------------------------
  const sphereGeo = new THREE.SphereGeometry(1, 128, 128);
  const groups = new Map<Planet, THREE.Group>();
  let planetOffsetX = 0;

  function addAtmosphere(parent: THREE.Object3D, color: THREE.Color, strength: number) {
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.015, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
        uniforms: {
          sunDir: { value: SUN_DIR }, uColor: { value: color },
          uStrength: { value: strength }, uOpacity: { value: 1 },
        },
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }),
    );
    parent.add(atmo);
  }

  function buildEarth(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: EARTH_FRAG, transparent: true,
      uniforms: {
        dayMap: { value: loadTex('earth_day.jpg', true) },
        nightMap: { value: loadTex('earth_night.jpg', true) },
        waterMap: { value: loadTex('earth_water.png', false) },
        sunDir: { value: SUN_DIR }, camPos: { value: camera.position },
        uOpacity: { value: 1 },
      },
    });
    const earth = new THREE.Mesh(sphereGeo, mat);
    g.add(earth);

    const cloudMat = new THREE.MeshLambertMaterial({
      map: loadTex('earth_clouds.png', true), transparent: true, depthWrite: false, opacity: 0.85,
    });
    cloudMat.userData.baseOpacity = 0.85;
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 96, 96), cloudMat);
    g.add(clouds);

    addAtmosphere(g, new THREE.Color(0.3, 0.58, 1.0), 0.7);
    g.userData = { spin: earth, clouds } as Spin;
    return g;
  }

  function buildMoon(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: MOON_FRAG, transparent: true,
      uniforms: {
        // linear load (no sRGB decode) to keep the design's brightness; anisotropy
        // 1 so the shader's mip-bias maria lookup is respected
        dayMap: { value: loadTex('moon.jpg', false, 1) },
        sunDir: { value: SUN_DIR }, uDetail: { value: 0.4 }, uOpacity: { value: 1 },
      },
    });
    const moon = new THREE.Mesh(sphereGeo, mat);
    g.add(moon);
    g.userData = { spin: moon } as Spin;
    return g;
  }

  function buildMars(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: MARS_FRAG, transparent: true,
      uniforms: {
        // load the albedo LINEAR (no sRGB decode): the design's raw pipeline fed
        // the orange map straight to the shader; decoding here would crush the
        // green channel and sink Mars into dark blood-red.
        dayMap: { value: loadTex('mars.jpg', false) },
        bumpMap: { value: loadTex('mars_bump.jpg', false) },
        sunDir: { value: SUN_DIR }, camPos: { value: camera.position }, uOpacity: { value: 1 },
      },
    });
    const body = new THREE.Mesh(sphereGeo, mat);
    g.add(body);
    addAtmosphere(g, new THREE.Color(0.9, 0.58, 0.34), 0.35);
    g.userData = { spin: body } as Spin;
    return g;
  }

  function buildGasGiant(file: string, frag: string, glow: THREE.Color, glowStrength: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: frag, transparent: true,
      uniforms: {
        dayMap: { value: loadTex(file, true) },
        sunDir: { value: SUN_DIR }, camPos: { value: camera.position }, uOpacity: { value: 1 },
      },
    });
    const body = new THREE.Mesh(sphereGeo, mat);
    g.add(body);
    addAtmosphere(g, glow, glowStrength);
    g.userData = { spin: body } as Spin;
    return g;
  }

  function buildSaturn(): THREE.Group {
    const g = new THREE.Group();
    // tilted, slightly-shrunk sub-group so the ring plane slants and the planet
    // sits at the group's world centre (used for the ring's shadow term)
    const PR = 0.78;
    const tilt = new THREE.Group();
    tilt.scale.setScalar(PR);
    tilt.rotation.set(0.34, 0, -0.42);
    g.add(tilt);

    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: SATURN_FRAG, transparent: true,
      uniforms: {
        dayMap: { value: loadTex('saturn.jpg', true) },
        sunDir: { value: SUN_DIR }, camPos: { value: camera.position }, uOpacity: { value: 1 },
      },
    });
    const body = new THREE.Mesh(sphereGeo, mat);
    tilt.add(body);

    // atmosphere shell scaled with the planet
    addAtmosphere(tilt, new THREE.Color(0.95, 0.82, 0.58), 0.35);

    // procedural rings: u runs inner (1.24 R) → outer (2.27 R)
    const inner = 1.24, outer = 2.27;
    const ringGeo = new THREE.RingGeometry(inner, outer, 512, 8);
    const rPos = ringGeo.attributes.position as THREE.BufferAttribute;
    const rUv = ringGeo.attributes.uv as THREE.BufferAttribute;
    for (let ri = 0; ri < rPos.count; ri++) {
      const rr = Math.hypot(rPos.getX(ri), rPos.getY(ri));
      rUv.setXY(ri, (rr - inner) / (outer - inner), 0.5);
    }
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      uniforms: {
        sunDir: { value: SUN_DIR },
        uPlanet: { value: g.position }, // world centre of the planet (layout keeps this live)
        uPR: { value: PR },
        uDetail: { value: 1 }, uBright: { value: 1 }, uOpacity: { value: 1 },
      },
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);

    g.userData = { spin: body } as Spin;
    return g;
  }

  function buildNeptune(): THREE.Group {
    const g = new THREE.Group();
    g.scale.y = 0.975; // gentle oblateness
    const mat = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: NEPTUNE_FRAG, transparent: true,
      uniforms: {
        dayMap: { value: loadTex('neptune.jpg', true) },
        sunDir: { value: SUN_DIR }, camPos: { value: camera.position }, uOpacity: { value: 1 },
      },
    });
    const body = new THREE.Mesh(sphereGeo, mat);
    g.add(body);
    addAtmosphere(g, new THREE.Color(0.3, 0.55, 1.0), 0.75);
    g.userData = { spin: body } as Spin;
    return g;
  }

  function buildPlanet(p: Planet): THREE.Group {
    let g: THREE.Group;
    if (p === 'earth') g = buildEarth();
    else if (p === 'moon') g = buildMoon();
    else if (p === 'mars') g = buildMars();
    else if (p === 'jupiter') g = buildGasGiant('jupiter.jpg', JUPITER_FRAG, new THREE.Color(0.95, 0.78, 0.55), 0.4);
    else if (p === 'saturn') g = buildSaturn();
    else g = buildNeptune();
    g.position.x = planetOffsetX;
    g.visible = false;
    scene.add(g);
    groups.set(p, g);
    return g;
  }

  // Track the live opacity of each group so an interrupted crossfade resumes
  // from where it was rather than popping back to full.
  const groupOpacity = new WeakMap<THREE.Group, number>();

  // The surface disc (userData.spin). During a crossfade the outgoing disc must
  // stop writing depth, otherwise two co-located discs of different size fight
  // over the depth buffer and cull chunks out of each other — the "weird sphere"
  // flicker. The settled planet keeps depthWrite on so Saturn's ring still
  // occludes correctly against the planet body.
  function setBodyDepthWrite(group: THREE.Group, value: boolean) {
    const body = (group.userData as Spin).spin as THREE.Mesh;
    const mat = body.material as THREE.ShaderMaterial | undefined;
    if (mat) mat.depthWrite = value;
  }

  function setGroupOpacity(group: THREE.Group, value: number) {
    groupOpacity.set(group, value);
    group.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (!mat) return;
      const sm = mat as THREE.ShaderMaterial;
      if (sm.isShaderMaterial && sm.uniforms.uOpacity) sm.uniforms.uOpacity.value = value;
      else mat.opacity = value * (mat.userData.baseOpacity ?? 1);
    });
  }

  // ---- planet switching (instant swap) -------------------------------------
  let active: Planet | null = null;

  function setPlanet(p: Planet) {
    if (p === active) return;
    const prev = active ? groups.get(active) : undefined;
    const next = groups.get(p) ?? buildPlanet(p);
    active = p;
    // Instant swap — no crossfade. The old planet is hidden and the new one shown
    // at full opacity on the same frame, so the two never overlap and there's no
    // blend-through "crossover" moment.
    if (prev && prev !== next) { prev.visible = false; setGroupOpacity(prev, 0); }
    next.visible = true;
    setBodyDepthWrite(next, true);
    setGroupOpacity(next, 1);
    needsRender = true;
  }

  // ---- layout ---------------------------------------------------------------
  // The planet always sits at the same spot on the LEFT (like the design), never
  // re-centres. It's anchored at a fixed fraction of the way toward the left edge
  // (NDC ≈ -0.88, i.e. the design's -1.94 / 2.2 at 16:9) so it holds that exact
  // left position at every window size / aspect ratio.
  const PLANET_NDC_X = -0.88;
  const tanHalfFov = Math.tan((camera.fov * Math.PI) / 180 / 2);
  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // On portrait/narrow windows pull the camera back so a radius-1 disc still
    // fits vertically; landscape keeps the design's z = 3.4.
    camera.position.z = camera.aspect >= 1 ? 3.4 : 3.4 / camera.aspect;
    // half the visible world-width at the planet's depth, then place the planet
    // centre at the fixed left fraction of it — same left position everywhere.
    const halfW = tanHalfFov * camera.position.z * camera.aspect;
    planetOffsetX = PLANET_NDC_X * halfW;
    camera.updateProjectionMatrix();
    groups.forEach((g) => { g.position.x = planetOffsetX; });
    needsRender = true;
  }
  window.addEventListener('resize', layout);

  // ---- render loop ----------------------------------------------------------
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let elapsed = 0;
  let needsRender = true;
  const frameBudget = 1000 / MAX_FPS;

  function renderAt() {
    const frac = (elapsed % ROTATION_PERIOD_S) / ROTATION_PERIOD_S;
    const rot = 3.9 + frac * Math.PI * 2;
    groups.forEach((g) => {
      if (!g.visible) return;
      const s = g.userData as Spin;
      s.spin.rotation.y = rot;
      if (s.clouds) s.clouds.rotation.y = rot + 0.35;
    });
    starMat.uniforms.uT.value = frac;
    for (const m of meteors) {
      const mdt = (((elapsed - m.start) % ROTATION_PERIOD_S) + ROTATION_PERIOD_S) % ROTATION_PERIOD_S;
      const mp = mdt / m.dur;
      if (mp < 1.0) {
        m.mesh.visible = true;
        m.mat.uniforms.uA.value = Math.sin(Math.PI * mp) * 1.1;
        const md = mp * m.travel;
        m.mesh.position.set(m.x0 + m.dx * md, m.y0 + m.dy * md, -58);
      } else {
        m.mesh.visible = false;
      }
    }
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    acc += dt;
    if (acc < frameBudget) return;
    if (!reducedMotion) elapsed += acc / 1000;
    acc = 0;

    const animating = !reducedMotion; // starfield/meteors/rotation always evolving
    if (animating || needsRender) { needsRender = false; renderAt(); }
  }

  function start() { last = performance.now(); raf = requestAnimationFrame(tick); }
  function stop() { cancelAnimationFrame(raf); }
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  layout();
  start();

  return {
    setPlanet,
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', layout);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat) {
          const any = mat as THREE.MeshStandardMaterial & THREE.ShaderMaterial;
          any.map?.dispose();
          if (any.uniforms) Object.values(any.uniforms).forEach((u) => {
            const val = (u as { value?: unknown }).value;
            if (val instanceof THREE.Texture) (val as THREE.Texture).dispose();
          });
          mat.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
