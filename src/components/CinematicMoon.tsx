/**
 * CinematicMoon — slowly self-rotating 3D lunar sphere anchored top-left.
 *
 * Real PBR sphere (Three.js), warm directional key + cool ambient fill,
 * subtle CSS halo glow behind the canvas, partially bleeds off-corner
 * so it reads as a celestial body framing the scene. Sits behind UI.
 *
 * - prefers-reduced-motion: rotation + float frozen.
 * - WebGL/texture failure: silently hidden by error boundary + Suspense.
 * - Pointer-events: none.
 */
import { Suspense, useMemo, useRef, useEffect, useState, Component, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// NASA-derived lunar texture (CC0 / public domain). Hosted on a stable CDN.
const MOON_COLOR_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Moonmap_from_clementine_data.png/2048px-Moonmap_from_clementine_data.png';
const MOON_NORMAL_URL =
  'https://threejs.org/examples/textures/planets/moon_1024.jpg'; // grayscale used as bump

function MoonMesh({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const startRef = useRef<number>(performance.now());

  const [colorMap, bumpMap] = useTexture([MOON_COLOR_URL, MOON_NORMAL_URL]);

  useMemo(() => {
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.anisotropy = 8;
    bumpMap.anisotropy = 8;
  }, [colorMap, bumpMap]);

  useFrame(() => {
    if (reducedMotion) return;
    const t = (performance.now() - startRef.current) / 1000;
    if (meshRef.current) {
      // ~60s per full rotation
      meshRef.current.rotation.y = (t / 60) * Math.PI * 2;
    }
    if (groupRef.current) {
      // ±0.04 unit float over 12s (sphere radius is 1, camera distance ~3)
      groupRef.current.position.y = Math.sin((t / 12) * Math.PI * 2) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} rotation={[0.15, 0, 0.05]}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.04}
          color={new THREE.Color('#E8E4D8')}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

class MoonErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* swallow */
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function CinematicMoon() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [supportsWebGL, setSupportsWebGL] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);

    // Quick WebGL capability probe
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) setSupportsWebGL(false);
    } catch {
      setSupportsWebGL(false);
    }

    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!supportsWebGL) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[1] select-none"
      style={{
        // ~70% visible — bleed ~30% off the top-left corner
        width: 'clamp(180px, 24vw, 340px)',
        height: 'clamp(180px, 24vw, 340px)',
        transform: 'translate(-28%, -28%)',
      }}
    >
      {/* Soft outer halo — pure CSS, free of cost */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(232,228,216,0.18) 0%, rgba(232,228,216,0.08) 35%, rgba(232,228,216,0) 65%)',
          filter: 'blur(8px)',
        }}
      />
      <MoonErrorBoundary>
        <Suspense fallback={null}>
          <Canvas
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
            camera={{ position: [0, 0, 3], fov: 35 }}
            style={{ background: 'transparent' }}
          >
            {/* Cool ambient fill (deep blue shadow tone) */}
            <ambientLight intensity={0.18} color={'#3a4a6b'} />
            {/* Warm directional key from lower-right */}
            <directionalLight
              position={[2.5, -1.5, 2]}
              intensity={1.25}
              color={'#fff1d6'}
            />
            {/* Subtle rim from upper-left to define silhouette */}
            <directionalLight
              position={[-2, 2, -1]}
              intensity={0.15}
              color={'#9bb3d9'}
            />
            <MoonMesh reducedMotion={reducedMotion} />
          </Canvas>
        </Suspense>
      </MoonErrorBoundary>
    </div>
  );
}
