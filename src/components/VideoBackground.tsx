import { useEffect, useRef, useState, useCallback } from 'react';

// Drop-in replacement for SplineBackground: same `activePlanet` API, but renders
// pre-rendered looping video instead of a live 3D scene. Hardware video decode is
// far cheaper than realtime WebGL + physics, so this holds 60fps on low-end PCs.
//
// Graceful degradation, per layer: <video> → poster <img> → CSS deep-space gradient.
// So the background looks intentional even before any video assets are produced.

export type Planet = 'earth' | 'moon' | 'mars' | 'saturn' | 'jupiter';

// Assets live in public/backgrounds/. See public/backgrounds/README.md for specs.
// Missing files degrade gracefully (see above) — ship the wiring before the media.
// Respect Vite's base path (e.g. "/caesar0dte/" on GitHub Pages) so asset URLs
// resolve under the deployed sub-path. BASE_URL ends with a slash.
const asset = (planet: Planet, ext: string) =>
  `${import.meta.env.BASE_URL}backgrounds/${planet}.${ext}`;

// Deep-space fallback shown when neither video nor poster is available.
const SPACE_BG =
  'radial-gradient(circle at 30% 28%, #0a1a34 0%, #060a18 55%, #03040c 100%)';

const FADE_MS = 700;

interface Props {
  activePlanet?: Planet;
}

interface LayerData {
  planet: Planet;
  id: number;
}

// A single stacked, absolutely-positioned layer. Mounts at opacity 0 and fades in
// over the layer(s) beneath it — that overlap is the crossfade. Reports back once
// fully shown so the parent can prune the now-hidden layers underneath.
function Layer({
  planet,
  reducedMotion,
  onShown,
}: {
  planet: Planet;
  reducedMotion: boolean;
  onShown: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const showVideo = !reducedMotion && !videoFailed;

  return (
    <div
      className="absolute inset-0"
      style={{
        background: SPACE_BG,
        opacity: shown ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease`,
      }}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'opacity' && shown) onShown();
      }}
    >
      {showVideo ? (
        <video
          key={planet}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={posterFailed ? undefined : asset(planet, 'jpg')}
          onError={() => setVideoFailed(true)}
        >
          <source src={asset(planet, 'webm')} type="video/webm" />
          <source src={asset(planet, 'mp4')} type="video/mp4" />
        </video>
      ) : (
        !posterFailed && (
          <img
            src={asset(planet, 'jpg')}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setPosterFailed(true)}
          />
        )
      )}
    </div>
  );
}

export default function VideoBackground({ activePlanet = 'earth' }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const idRef = useRef(1);
  const [layers, setLayers] = useState<LayerData[]>([
    { planet: activePlanet, id: 0 },
  ]);

  // Respect the OS "reduce motion" setting — those users get the still poster.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // On planet change, push a new top layer that fades in over the current one.
  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.planet === activePlanet) return prev;
      return [...prev, { planet: activePlanet, id: idRef.current++ }];
    });
  }, [activePlanet]);

  // Once the top layer has finished fading in, drop everything beneath it so we
  // never keep more than one idle video decoding in the background.
  const handleShown = useCallback((id: number) => {
    setLayers((prev) => {
      if (prev[prev.length - 1].id !== id) return prev; // a newer layer is fading in
      return prev.slice(-1);
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden z-[-1]"
      style={{ background: SPACE_BG }}
    >
      {layers.map((layer) => (
        <Layer
          key={layer.id}
          planet={layer.planet}
          reducedMotion={reducedMotion}
          onShown={() => handleShown(layer.id)}
        />
      ))}
    </div>
  );
}
