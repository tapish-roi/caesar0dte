import { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

const SCENE_URL = 'https://prod.spline.design/NUPw44thQYx9Wu19/scene.splinecode';

const FRAME = {
  scale: 2.4,
  offsetXFrac: -0.18,
};

const PLANET_NAMES: Record<Planet, string> = {
  earth: 'Earth',
  moon: 'Moon',
  mars: 'Mars',
};

export type Planet = 'earth' | 'moon' | 'mars';

function getInitialDims() {
  if (typeof window === 'undefined') return { w: 1920, h: 1080 };
  return { w: window.innerWidth, h: window.innerHeight };
}

interface Props {
  activePlanet?: Planet;
}

export default function SplineBackground({ activePlanet = 'earth' }: Props) {
  const [dims] = useState(getInitialDims);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const splineRef = useRef<any>(null);

  const showPlanet = useCallback((planet: Planet, app: any) => {
    Object.entries(PLANET_NAMES).forEach(([key, name]) => {
      const obj = app.findObjectByName(name);
      if (obj) obj.visible = key === planet;
    });
  }, []);

  const handleLoad = useCallback((app: any) => {
    splineRef.current = app;
    showPlanet(activePlanet, app);
  }, [activePlanet, showPlanet]);

  useEffect(() => {
    if (splineRef.current) {
      showPlanet(activePlanet, splineRef.current);
    }
  }, [activePlanet, showPlanet]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 overflow-hidden z-[-1]"
      style={{ width: dims.w, height: dims.h }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${dims.w * FRAME.offsetXFrac}px) scale(${FRAME.scale})`,
          transformOrigin: 'center center',
        }}
      >
        <Suspense fallback={null}>
          <Spline scene={SCENE_URL} onLoad={handleLoad} style={{ width: '100%', height: '100%' }} />
        </Suspense>
      </div>
    </div>
  );
}
