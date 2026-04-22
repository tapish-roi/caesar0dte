import { useEffect, useRef } from 'react';
import plutoImg from '@/assets/pluto.png';
import moonImg from '@/assets/moon.png';

/**
 * SpaceBackground — cinematic deep-space ambience.
 *
 * Layers (back → front, all behind UI):
 *   1. Far stars      — tiny dense, slowest drift
 *   2. Mid stars      — varied sizes, subtle drift
 *   3. Nebula         — soft animated color washes
 *   4. Near stars     — sparse warm/cool, fastest
 *   5. Pluto (top-left) + Moon (bottom-right) — hero celestial bodies
 *   6. Fine grain noise — banding break
 *   7. Shooting star  — rare cinematic accent
 *
 * All animations use transform/opacity only on GPU. Subtle pointer parallax
 * applied to hero objects via CSS variables — never blocks UI (pointer-events:none).
 */
export default function SpaceBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Subtle mouse parallax — updates CSS vars only, no React re-renders
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    const onMove = (e: MouseEvent) => {
      // Normalize to [-1, 1]
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      tx = nx;
      ty = ny;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          root.style.setProperty('--mx', tx.toFixed(3));
          root.style.setProperty('--my', ty.toFixed(3));
          raf = 0;
        });
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
      style={{ ['--mx' as string]: 0, ['--my' as string]: 0 }}
    >
      {/* Deep space base wash — pure void behind everything */}
      <div className="space-void" />

      {/* Far layer — tiny dense distant stars */}
      <div className="space-layer space-layer-far" />

      {/* Mid star layer — varied star sizes with color */}
      <div className="space-layer space-layer-mid-stars" />

      {/* Nebula layer — soft drifting color washes */}
      <div className="space-layer space-layer-nebula" />

      {/* Near layer — bright foreground stars */}
      <div className="space-layer space-layer-near" />

      {/* Twinkle overlay — randomized opacity pulse on a subset */}
      <div className="space-layer space-layer-twinkle" />

      {/* Hero celestial body #1 — Pluto, top-left */}
      <div className="space-pluto-wrap">
        <div className="space-pluto-glow" />
        <img
          src={plutoImg}
          alt=""
          className="space-pluto"
          draggable={false}
          loading="lazy"
          width={1024}
          height={1024}
        />
      </div>

      {/* Hero celestial body #2 — Moon, bottom-right */}
      <div className="space-moon-wrap">
        <div className="space-moon-glow" />
        <img
          src={moonImg}
          alt=""
          className="space-moon"
          draggable={false}
          loading="lazy"
          width={1024}
          height={1024}
        />
      </div>

      {/* Rare shooting star */}
      <div className="space-shooting-star" />

      {/* Fine grain noise — kills banding */}
      <div className="space-noise" />
    </div>
  );
}
