import { useEffect, useRef } from 'react';
import type { Planet, SceneApi } from './planet-background/scene';

export type { Planet };

// Lightweight three.js replacement for the Spline background (same activePlanet
// API). The scene module is imported dynamically so three.js ships as its own
// lazy chunk and never blocks the dashboard bundle. If WebGL is unavailable the
// CSS deep-space gradient below simply stays visible.

const SPACE_BG =
  'radial-gradient(circle at 30% 28%, #0a1a34 0%, #060a18 55%, #03040c 100%)';

interface Props {
  activePlanet?: Planet;
}

export default function PlanetBackground({ activePlanet = 'earth' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const planetRef = useRef<Planet>(activePlanet);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createPlanetScene } = await import('./planet-background/scene');
        if (cancelled || !canvasRef.current) return;
        apiRef.current = createPlanetScene(canvasRef.current);
        apiRef.current.setPlanet(planetRef.current);
      } catch (err) {
        // WebGL unavailable or context creation failed — gradient fallback stays.
        console.error('PlanetBackground: falling back to gradient', err);
      }
    })();
    return () => {
      cancelled = true;
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    planetRef.current = activePlanet;
    apiRef.current?.setPlanet(activePlanet);
  }, [activePlanet]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-[-1]"
      style={{ background: SPACE_BG }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
