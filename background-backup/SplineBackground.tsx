import { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';

const Spline = lazy(() => import('@splinetool/react-spline'));

// Static version pin — lets the browser HTTP-cache the multi-MB scene between
// visits. Bump the number manually after publishing Spline edits to force a refresh.
const SCENE_VERSION = 1;
const SCENE_URL = `https://prod.spline.design/NUPw44thQYx9Wu19/scene.splinecode?v=${SCENE_VERSION}`;

const FRAME = {
  scale: 1.6,        // was 2.4 — lower = far fewer GPU pixels (56% less)
  offsetXFrac: -0.18,
};

// Object names MUST match the Spline scene exactly (case-sensitive).
// Verified via getAllObjects() at runtime: "Earth", "moon", "mars",
// "Saturn", "Jupiter".
const PLANET_NAMES: Record<Planet, string> = {
  earth: 'Earth',
  moon: 'moon',
  mars: 'mars',
  saturn: 'Saturn',
  jupiter: 'Jupiter',
};

export type Planet = 'earth' | 'moon' | 'mars' | 'saturn' | 'jupiter';

function getInitialDims() {
  if (typeof window === 'undefined') return { w: 1920, h: 1080 };
  return { w: window.innerWidth, h: window.innerHeight };
}

interface Props {
  activePlanet?: Planet;
}

type Vec3 = { x: number; y: number; z: number };

export default function SplineBackground({ activePlanet = 'earth' }: Props) {
  const [dims] = useState(getInitialDims);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const splineRef = useRef<any>(null);

  // Each planet sits at a different 3D spot in the Spline scene; the camera
  // is framed on Earth's spot. To show moon / mars we move them into Earth's
  // spot and shove the inactive ones back to their original locations.
  const originalPositions = useRef<Map<string, Vec3>>(new Map());
  const stagePosition = useRef<Vec3 | null>(null);

  const showPlanet = useCallback((planet: Planet, app: any) => {
    // First call: cache every planet's authored position so we can restore
    // them later, and remember Earth's position as the on-camera "stage".
    if (originalPositions.current.size === 0) {
      for (const name of Object.values(PLANET_NAMES)) {
        const obj = app.findObjectByName(name);
        if (obj) {
          originalPositions.current.set(name, {
            x: obj.position.x,
            y: obj.position.y,
            z: obj.position.z,
          });
        }
      }
      stagePosition.current = originalPositions.current.get(PLANET_NAMES.earth) ?? null;
    }

    const stage = stagePosition.current;
    if (!stage) return;

    Object.entries(PLANET_NAMES).forEach(([key, name]) => {
      const obj = app.findObjectByName(name);
      if (!obj) return;
      const orig = originalPositions.current.get(name);
      if (!orig) return;
      const isActive = key === planet;
      if (isActive) {
        obj.position.x = stage.x;
        obj.position.y = stage.y;
        obj.position.z = stage.z;
        obj.visible = true;
      } else {
        obj.position.x = orig.x;
        obj.position.y = orig.y;
        obj.position.z = orig.z;
        obj.visible = false;
      }
    });
  }, []);

  const handleLoad = useCallback((app: any) => {
    splineRef.current = app;

    // Keep DPR at 1 — the canvas is already oversized (1.6× viewport) so
    // retina supersampling would push GPU work to ~10× normal viewport pixels.
    // The oversized canvas already gives good sharpness without the DPR tax.
    const canvas: HTMLCanvasElement | undefined = app.canvas;
    if (canvas) {
      const cssW = canvas.clientWidth || dims.w * FRAME.scale;
      const cssH = canvas.clientHeight || dims.h * FRAME.scale;
      app.setSize?.(cssW, cssH);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    // Spline sometimes reports 0 objects right at onLoad and populates a
    // tick later, so poll briefly until objects are available.
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts++;
      const ready = (app.getAllObjects?.() ?? []).length > 0;
      if (ready) {
        showPlanet(activePlanet, app);
        window.clearInterval(interval);
      } else if (attempts >= 40) {
        window.clearInterval(interval);
      }
    }, 200);
  }, [activePlanet, showPlanet, dims.w, dims.h]);

  useEffect(() => {
    if (splineRef.current) {
      showPlanet(activePlanet, splineRef.current);
    }
  }, [activePlanet, showPlanet]);

  // Render Spline at a physically larger canvas size (dims * scale) and
  // crop/position it within the viewport-sized container. This is visually
  // equivalent to `transform: scale(N)` but Spline actually renders at the
  // higher resolution — so the planet stays crisp instead of getting
  // upscaled and pixelated.
  const innerW = dims.w * FRAME.scale;
  const innerH = dims.h * FRAME.scale;
  const innerLeft = -(innerW - dims.w) / 2 + dims.w * FRAME.offsetXFrac;
  const innerTop = -(innerH - dims.h) / 2;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 overflow-hidden z-[-1]"
      style={{ width: dims.w, height: dims.h }}
    >
      <div
        style={{
          position: 'absolute',
          left: innerLeft,
          top: innerTop,
          width: innerW,
          height: innerH,
        }}
      >
        <Suspense fallback={null}>
          {/* renderOnDemand: Spline skips re-rendering frames where nothing
              changed — huge GPU saving while Earth/planets still animate */}
          <Spline
            scene={SCENE_URL}
            onLoad={handleLoad}
            renderOnDemand={true}
            style={{ width: '100%', height: '100%' }}
          />
        </Suspense>
      </div>
    </div>
  );
}
