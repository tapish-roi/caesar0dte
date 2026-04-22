/**
 * SpaceBackground — ambient depth for the dashboard.
 *
 * Three fixed parallax layers (Far / Mid drift / Near) plus a fine-grain
 * noise overlay. All layers sit behind the UI (z-index: 0) and use
 * transform-only animations on GPU (will-change: transform).
 *
 * ADDITIONS (non-breaking):
 *   - Large accent stars (8 fixed positions, slow twinkle, 3-6px, soft glow)
 *   - Shooting stars layer (1-2 active, randomized 15-40s intervals)
 *
 * Both additions are pointer-events:none and behind the UI.
 *
 * Designed to be mounted ONCE per page root. The existing
 * `.main-content-gradient` color wash on <main> remains untouched
 * and serves as the primary "anchor" wash visible through these layers.
 */
import { useEffect, useState } from 'react';

// 8 hand-balanced positions — spread across the screen, no clustering.
// Each: { x%, y%, size px, opacity, twinkle delay }
const LARGE_STARS = [
  { x: 12, y: 18, size: 4, op: 0.55, delay: 0 },
  { x: 84, y: 11, size: 3, op: 0.5, delay: 2.4 },
  { x: 47, y: 32, size: 5, op: 0.6, delay: 5.1 },
  { x: 22, y: 62, size: 3, op: 0.45, delay: 1.2 },
  { x: 71, y: 48, size: 4, op: 0.55, delay: 3.7 },
  { x: 92, y: 73, size: 3, op: 0.5, delay: 6.3 },
  { x: 38, y: 88, size: 5, op: 0.55, delay: 4.0 },
  { x: 8, y: 81, size: 4, op: 0.5, delay: 2.0 },
];

interface Shoot {
  id: number;
  // Start position in % viewport; angle is fixed diagonal per direction
  startX: number;
  startY: number;
  // direction: 1 = down-right, -1 = down-left
  dir: 1 | -1;
  duration: number; // seconds
  length: number; // px (trail width)
}

let _shootId = 0;

export default function SpaceBackground() {
  const [shoots, setShoots] = useState<Shoot[]>([]);

  useEffect(() => {
    // Respect reduced motion — no shooting stars
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
      // 15s..40s interval
      const delayMs = (15 + Math.random() * 25) * 1000;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        spawn();
        schedule();
      }, delayMs);
    };

    const spawn = () => {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const startX = dir === 1 ? -5 + Math.random() * 30 : 75 + Math.random() * 30;
      const startY = -5 + Math.random() * 35; // upper portion of screen
      const duration = 0.6 + Math.random() * 0.6; // 0.6s..1.2s
      const length = 140 + Math.random() * 120; // px
      const id = ++_shootId;
      const shoot: Shoot = { id, startX, startY, dir, duration, length };
      setShoots(prev => (prev.length >= 2 ? prev : [...prev, shoot]));
      // Auto-remove just after animation ends
      window.setTimeout(() => {
        setShoots(prev => prev.filter(s => s.id !== id));
      }, duration * 1000 + 200);
    };

    // First one — short delay so it doesn't fire instantly on mount
    timer = window.setTimeout(() => {
      if (!cancelled) {
        spawn();
        schedule();
      }
    }, 6000 + Math.random() * 8000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {/* Far layer — faint distant stars, drifts very slowly diagonally */}
      <div className="space-layer space-layer-far" />

      {/* Mid layer — soft nebula glow, slow drift, the "anchor" depth */}
      <div className="space-layer space-layer-mid" />

      {/* Near layer — small foreground particles, slightly faster */}
      <div className="space-layer space-layer-near" />

      {/* Fine grain noise overlay — breaks color banding */}
      <div className="space-noise" />

      {/* === Pluto — distant background planet, bottom-right === */}
      <div className="pluto-wrap">
        <div className="pluto-halo" />
        <div className="pluto-body" />
      </div>

      {/* === ADDITIONS — large accent stars === */}
      <div className="absolute inset-0 pointer-events-none">
        {LARGE_STARS.map((s, i) => (
          <span
            key={i}
            className="space-large-star"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              ['--star-op' as string]: s.op,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* === ADDITIONS — shooting stars === */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {shoots.map(s => (
          <span
            key={s.id}
            className={`space-shooting-star ${s.dir === 1 ? 'shoot-dir-r' : 'shoot-dir-l'}`}
            style={{
              left: `${s.startX}%`,
              top: `${s.startY}%`,
              width: `${s.length}px`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
