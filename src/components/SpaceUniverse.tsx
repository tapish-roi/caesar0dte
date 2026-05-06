/**
 * SpaceUniverse — full-screen WebGL backdrop layered behind the UI.
 *
 * Each app tab maps to a unique planet. Switching tabs smoothly flies the
 * camera and orbiting planet system to a new position. The active planet
 * sits OFF-CENTER (right-bottom on desktop, lower-left on mobile/RTL) so it
 * never obscures the main UI panel.
 *
 * Layers (depth → near):
 *   1. drei <Stars>     — radial deep starfield
 *   2. distant planets   — passive, rotate slowly, depth cues
 *   3. active planet    — the highlighted one, larger, with atmosphere glow
 *   4. (rings if any)
 *
 * Reactivity:
 *   • Mouse parallax → camera tilts with cursor (1° each axis)
 *   • Scroll parallax → camera lifts as the user scrolls down
 *   • Tab change     → camera + planet swap with eased lerp (1.4 s)
 *
 * Performance:
 *   • Single Canvas, dpr capped at [1, 1.5], frameloop="always"
 *   • Honors prefers-reduced-motion (rotation slowed, parallax muted)
 */
import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useActiveTab, type PlanetId } from '@/lib/activeTabStore';

// ── Planet palette per tab ─────────────────────────────────────────────────
interface PlanetSpec {
  /** primary surface color */
  color: string;
  /** secondary surface color (gets noise-blended in) */
  accent: string;
  /** atmosphere rim glow */
  atmosphere: string;
  /** how rough the planet is — 0 mirror, 1 chalk */
  roughness: number;
  /** base radius (active planet) */
  radius: number;
  /** ring? */
  ring?: { inner: number; outer: number; color: string; opacity: number };
  /** subtle emissive glow (for sun-like) */
  emissive?: string;
  emissiveIntensity?: number;
  /** camera target offset — so each tab feels like a different vantage */
  cameraOffset: [number, number, number];
  /** planet world position */
  position: [number, number, number];
  /** axial rotation speed (rad/s) */
  spin: number;
}

const PLANETS: Record<PlanetId, PlanetSpec> = {
  // Earth-ish — knowledge / lessons
  lessons:    { color: '#3b82f6', accent: '#1e40af', atmosphere: '#7dd3fc', roughness: 0.55, radius: 1.6,
                cameraOffset: [0, 0, 6], position: [3.2, -0.4, 0], spin: 0.08 },
  // Saturn-class — community / gathering
  community:  { color: '#f5d28a', accent: '#c08a3c', atmosphere: '#fde68a', roughness: 0.7, radius: 1.5,
                ring: { inner: 1.9, outer: 3.0, color: '#e7c982', opacity: 0.55 },
                cameraOffset: [0, 0.6, 6.5], position: [3.0, -0.2, 0], spin: 0.06 },
  // Mars-ish — students / explorers
  students:   { color: '#d97548', accent: '#7a2e1c', atmosphere: '#fca977', roughness: 0.85, radius: 1.45,
                cameraOffset: [0, 0, 6], position: [3.2, -0.5, 0], spin: 0.07 },
  // Sun-like — live broadcast
  live:       { color: '#ffd66e', accent: '#ff7a3a', atmosphere: '#ffb14a', roughness: 1.0, radius: 1.7,
                emissive: '#ff8a3a', emissiveIntensity: 0.85,
                cameraOffset: [0, 0, 6.5], position: [3.0, -0.2, 0], spin: 0.05 },
  // Neptune-ish — questions (deep, curious)
  questions:  { color: '#5b6cff', accent: '#1e1f8c', atmosphere: '#a5b4fc', roughness: 0.5, radius: 1.55,
                cameraOffset: [0, 0, 6], position: [3.2, -0.3, 0], spin: 0.07 },
  // Icy cyan — quizzes
  quizzes:    { color: '#7be3d4', accent: '#1f6e6e', atmosphere: '#bff0e7', roughness: 0.4, radius: 1.5,
                cameraOffset: [0, 0, 6], position: [3.2, -0.4, 0], spin: 0.09 },
  // Mercury-ish — calculator (metallic, precise)
  calculator: { color: '#9ca3af', accent: '#4b5563', atmosphere: '#cbd5e1', roughness: 0.35, radius: 1.4,
                cameraOffset: [0, 0, 5.8], position: [3.0, -0.5, 0], spin: 0.04 },
  // Purple gas giant — zoom (gateway)
  zoom:       { color: '#9b66ff', accent: '#4c1d95', atmosphere: '#c4b5fd', roughness: 0.55, radius: 1.65,
                ring: { inner: 2.0, outer: 2.7, color: '#c4b5fd', opacity: 0.4 },
                cameraOffset: [0, 0.3, 6.4], position: [3.0, -0.3, 0], spin: 0.07 },
  // Soft introductory planet — auth
  auth:       { color: '#5b8cff', accent: '#1e3a8a', atmosphere: '#a5c4ff', roughness: 0.6, radius: 1.5,
                cameraOffset: [0, 0, 7], position: [2.8, -0.5, 0], spin: 0.06 },
  // Earth-with-tilt — journal
  journal:    { color: '#22c55e', accent: '#14532d', atmosphere: '#86efac', roughness: 0.6, radius: 1.55,
                cameraOffset: [0.5, 0, 6], position: [3.2, -0.4, 0], spin: 0.07 },
  // Sun-class — livestream
  livestream: { color: '#ffd66e', accent: '#ff7a3a', atmosphere: '#ffb14a', roughness: 1.0, radius: 1.7,
                emissive: '#ff8a3a', emissiveIntensity: 0.85,
                cameraOffset: [0, 0, 6.5], position: [3.0, -0.2, 0], spin: 0.05 },
  // Quiz route uses quizzes look
  quiz:       { color: '#7be3d4', accent: '#1f6e6e', atmosphere: '#bff0e7', roughness: 0.4, radius: 1.5,
                cameraOffset: [0, 0, 6], position: [3.2, -0.4, 0], spin: 0.09 },
};

// ── Planet mesh with surface shader + atmosphere ───────────────────────────
function Planet({ spec, scale = 1 }: { spec: PlanetSpec; scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);

  // Custom shader: blend two colors using 3-D simplex-ish noise approximation
  // (cheap fractal of sin/cos, looks plausible for distant planets)
  const surfaceMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColorA:    { value: new THREE.Color(spec.color) },
        uColorB:    { value: new THREE.Color(spec.accent) },
        uTime:      { value: 0 },
        uRoughness: { value: spec.roughness },
        uEmissive:  { value: new THREE.Color(spec.emissive ?? '#000000') },
        uEmissiveI: { value: spec.emissiveIntensity ?? 0 },
        uLightDir:  { value: new THREE.Vector3(1, 0.6, 0.8).normalize() },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vPos;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uEmissive;
        uniform float uEmissiveI;
        uniform float uTime;
        uniform float uRoughness;
        uniform vec3 uLightDir;

        // cheap fractal noise — bands + swirls
        float n3(vec3 p) {
          return sin(p.x * 1.7) * 0.5 + sin(p.y * 2.3 + p.z) * 0.3
               + sin(p.z * 3.1 + p.x * 0.5) * 0.2;
        }
        float fbm(vec3 p) {
          float a = 0.5;
          float v = 0.0;
          for (int i = 0; i < 4; i++) {
            v += a * n3(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          // surface variation
          float t = fbm(vPos * 1.4 + vec3(uTime * 0.05, 0.0, 0.0));
          float band = smoothstep(-0.3, 0.6, t);
          vec3 surface = mix(uColorB, uColorA, band);

          // simple lambert-ish lighting
          float diffuse = max(dot(vNormal, uLightDir), 0.0);
          float ambient = 0.18;
          vec3 lit = surface * (ambient + diffuse * (1.0 - uRoughness * 0.5));

          // emissive (sun)
          lit += uEmissive * uEmissiveI;

          gl_FragColor = vec4(lit, 1.0);
        }
      `,
    });
  }, [spec]);

  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(spec.atmosphere) },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vView;
        uniform vec3 uColor;
        void main() {
          float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
          gl_FragColor = vec4(uColor, fres * 0.95);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, [spec]);

  useFrame((state, dt) => {
    if (meshRef.current) meshRef.current.rotation.y += spec.spin * dt;
    if (atmosphereRef.current) atmosphereRef.current.rotation.y += spec.spin * 0.3 * dt;
    surfaceMaterial.uniforms.uTime.value += dt;
  });

  return (
    <group scale={scale}>
      <mesh ref={meshRef} position={spec.position} castShadow receiveShadow>
        <sphereGeometry args={[spec.radius, 64, 64]} />
        <primitive object={surfaceMaterial} attach="material" />
      </mesh>
      {/* atmosphere — slightly larger sphere with backside fresnel */}
      <mesh ref={atmosphereRef} position={spec.position}>
        <sphereGeometry args={[spec.radius * 1.18, 32, 32]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
      {/* optional ring */}
      {spec.ring && <Ring spec={spec} />}
    </group>
  );
}

function Ring({ spec }: { spec: PlanetSpec }) {
  if (!spec.ring) return null;
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ringRef.current) ringRef.current.rotation.z += dt * 0.05;
  });
  return (
    <mesh
      ref={ringRef}
      position={spec.position}
      rotation={[Math.PI / 2.4, 0, 0]}
    >
      <ringGeometry args={[spec.ring.inner, spec.ring.outer, 96]} />
      <meshBasicMaterial
        color={spec.ring.color}
        transparent
        opacity={spec.ring.opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Distant decorative planets — depth cues, never the focus ──────────────
const DECOR_PLANETS: PlanetSpec[] = [
  { color: '#8b5cf6', accent: '#3b1d72', atmosphere: '#c4b5fd', roughness: 0.6, radius: 0.45,
    cameraOffset: [0,0,0], position: [-9, 4, -10], spin: 0.04 },
  { color: '#f97316', accent: '#7c2d12', atmosphere: '#fdba74', roughness: 0.8, radius: 0.55,
    cameraOffset: [0,0,0], position: [-12, -3, -14], spin: 0.03 },
  { color: '#22d3ee', accent: '#155e75', atmosphere: '#a5f3fc', roughness: 0.5, radius: 0.35,
    cameraOffset: [0,0,0], position: [10, 5, -16], spin: 0.05 },
];

// ── Camera + parallax controller ───────────────────────────────────────────
function CameraDirector({ planet }: { planet: PlanetId }) {
  const target = useRef(new THREE.Vector3(...PLANETS[planet].cameraOffset));
  const mouse = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);

  // mouse + scroll listeners
  useMemo(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMouse = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onScroll = () => {
      scroll.current = window.scrollY;
    };
    if (!reduced) {
      window.addEventListener('mousemove', onMouse, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    return () => {
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // update target whenever the active planet changes
  useMemo(() => {
    target.current.set(...PLANETS[planet].cameraOffset);
  }, [planet]);

  useFrame((state) => {
    const cam = state.camera;
    // base position derived from active planet
    const base = target.current;
    // mouse offset (1° tilt feel)
    const mx =  mouse.current.x * 0.4;
    const my = -mouse.current.y * 0.25;
    // scroll offset (lift slightly with scroll)
    const sy = Math.min(scroll.current * 0.0008, 1.2);

    cam.position.lerp(
      new THREE.Vector3(base.x + mx, base.y + my + sy, base.z),
      0.04, // damping — bigger = snappier
    );
    cam.lookAt(0, 0, 0);
  });

  return null;
}

// ── Active planet wrapper — softly fades scale on tab change ──────────────
function ActivePlanet({ planet }: { planet: PlanetId }) {
  const scale = useRef(1);
  const target = useRef(1);
  const lastPlanet = useRef(planet);

  // when planet changes, dip scale to 0 then back to 1 for a "warp" feel
  if (lastPlanet.current !== planet) {
    scale.current = 0.001;
    target.current = 1;
    lastPlanet.current = planet;
  }

  useFrame(() => {
    scale.current = THREE.MathUtils.lerp(scale.current, target.current, 0.08);
  });

  // re-mount via key so shaders rebuild for new palette
  return (
    <ScaleHost scaleRef={scale}>
      <Planet key={planet} spec={PLANETS[planet]} />
    </ScaleHost>
  );
}

function ScaleHost({ scaleRef, children }: { scaleRef: React.MutableRefObject<number>; children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      const s = scaleRef.current;
      groupRef.current.scale.set(s, s, s);
    }
  });
  return <group ref={groupRef}>{children}</group>;
}

// ── Public component ──────────────────────────────────────────────────────
export default function SpaceUniverse() {
  const planet = useActiveTab(s => s.planet);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[3]"
      style={{ contain: 'strict' }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 7], fov: 45, near: 0.1, far: 100 }}
        frameloop={reduced ? 'demand' : 'always'}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 3, 4]} intensity={1.1} />
        <pointLight position={[-8, -2, 3]} intensity={0.4} color="#9b66ff" />

        <Suspense fallback={null}>
          {/* deep starfield from drei */}
          <Stars
            radius={50}
            depth={40}
            count={2500}
            factor={3.5}
            saturation={0.4}
            fade
            speed={reduced ? 0 : 0.4}
          />

          {/* decorative distant planets */}
          {DECOR_PLANETS.map((p, i) => (
            <Planet key={`decor-${i}`} spec={p} scale={1} />
          ))}

          {/* the active planet */}
          <ActivePlanet planet={planet} />
        </Suspense>

        <CameraDirector planet={planet} />
      </Canvas>
    </div>
  );
}
