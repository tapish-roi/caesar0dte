/**
 * CinematicMoon — slowly self-rotating 3D lunar sphere anchored top-left.
 *
 * Real PBR sphere (Three.js), warm directional key + cool ambient fill,
 * subtle CSS halo glow behind the canvas, partially bleeds off-corner
 * so it reads as a celestial body framing the scene. Sits behind UI.
 *
 * - prefers-reduced-motion: rotation + float frozen.
 * - Texture failure: falls back to a plain shaded sphere (still visible).
 * - WebGL failure: silently hidden by error boundary.
 * - Pointer-events: none.
 */
import { Suspense, useRef, useEffect, useState, Component, ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// CORS-safe texture from the canonical three.js examples CDN.
const MOON_TEXTURE_URL =
  'https://threejs.org/examples/textures/planets/moon_1024.jpg';

function useMoonTexture(): { color: THREE.Texture | null; bump: THREE.Texture | null } {
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    let cancelled = false;
    loader.load(
      MOON_TEXTURE_URL,
      (t) => {
        if (cancelled) return;
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTex(t);
      },
      undefined,
      () => {
        // Fail silently — fallback sphere will render.
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { color: tex, bump: tex };
}

function MoonMesh({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const startRef = useRef<number>(performance.now());

  const { color: colorMap, bump: bumpMap } = useMoonTexture();

  useFrame(() => {
    if (reducedMotion) return;
    const t = (performance.now() - startRef.current) / 1000;
    if (meshRef.current) {
      meshRef.current.rotation.y = (t / 60) * Math.PI * 2;
    }
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin((t / 12) * Math.PI * 2) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} rotation={[0.15, 0, 0.05]}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial
          map={colorMap ?? undefined}
          bumpMap={bumpMap ?? undefined}
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
        width: 'clamp(180px, 24vw, 340px)',
        height: 'clamp(180px, 24vw, 340px)',
        transform: 'translate(-28%, -28%)',
      }}
    >
      {/* Halo sits behind the canvas in its own stacking layer so blur doesn't affect the sphere */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(232,228,216,0.22) 0%, rgba(232,228,216,0.08) 40%, rgba(232,228,216,0) 70%)',
          zIndex: 0,
        }}
      />
      <MoonErrorBoundary>
        <Suspense fallback={null}>
          <Canvas
            dpr={[1, 1.5]}
            gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
            camera={{ position: [0, 0, 3], fov: 35 }}
            style={{ background: 'transparent', position: 'relative', zIndex: 1, width: '100%', height: '100%' }}
          >
            <ambientLight intensity={0.18} color={'#3a4a6b'} />
            <directionalLight
              position={[2.5, -1.5, 2]}
              intensity={1.25}
              color={'#fff1d6'}
            />
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
