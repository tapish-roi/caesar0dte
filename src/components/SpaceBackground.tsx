/**
 * SpaceBackground — enhanced ambient depth for the dashboard.
 *
 * Layers (back → front):
 *   1. Far parallax   — dense tiled star field, 30+ stars/tile, slow drift
 *   2. Mid parallax   — 5-blob nebula (blue/indigo/purple/magenta/teal), breathing
 *   3. Near parallax  — 12 bright foreground stars, faster drift
 *   4. Aurora         — faint purple→teal band across top, slow horizontal shift
 *   5. Canvas         — 280 individually-twinkling procedural stars (RAF loop)
 *   6. Noise          — SVG fractal grain, breaks color banding
 *   7. Accent stars   — 22 hand-placed glow stars, 4 color variants, varied timing
 *   8. Shooting stars — React state, 6–18s interval, cyan or gold, 3 max concurrent
 *
 * Mouse parallax shifts layers 1-3 at different depths for 3-D feel.
 * All effects are pointer-events:none. Respects prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from 'react';

// ── Accent stars (22) — varied color + twinkle timing ─────────────────────
type StarColor = 'cyan' | 'gold' | 'purple' | 'white';
const LARGE_STARS: { x: number; y: number; size: number; op: number; delay: number; dur: number; color: StarColor }[] = [
  { x:  6, y: 14, size: 2.5, op: 0.28, delay: 0.0, dur: 6.2, color: 'cyan'   },
  { x: 18, y: 58, size: 2,   op: 0.25, delay: 2.4, dur: 8.5, color: 'gold'   },
  { x: 28, y: 32, size: 3,   op: 0.30, delay: 5.1, dur: 7.0, color: 'white'  },
  { x: 35, y: 81, size: 2,   op: 0.22, delay: 1.2, dur: 9.3, color: 'purple' },
  { x: 47, y: 19, size: 2.5, op: 0.27, delay: 3.7, dur: 5.8, color: 'cyan'   },
  { x: 54, y: 68, size: 2,   op: 0.25, delay: 6.3, dur: 7.6, color: 'gold'   },
  { x: 62, y: 44, size: 3,   op: 0.28, delay: 4.0, dur: 6.4, color: 'white'  },
  { x: 70, y: 88, size: 2,   op: 0.23, delay: 2.0, dur: 8.9, color: 'purple' },
  { x: 78, y: 25, size: 2.5, op: 0.27, delay: 1.5, dur: 5.5, color: 'cyan'   },
  { x: 85, y: 61, size: 2,   op: 0.25, delay: 4.8, dur: 7.1, color: 'gold'   },
  { x: 92, y: 10, size: 2.5, op: 0.28, delay: 3.2, dur: 6.8, color: 'white'  },
  { x: 97, y: 75, size: 2,   op: 0.22, delay: 7.0, dur: 9.0, color: 'purple' },
  { x: 12, y: 90, size: 2,   op: 0.25, delay: 0.8, dur: 6.0, color: 'gold'   },
  { x: 22, y: 44, size: 2.5, op: 0.26, delay: 5.5, dur: 7.8, color: 'cyan'   },
  { x: 42, y: 95, size: 2,   op: 0.22, delay: 2.9, dur: 8.2, color: 'purple' },
  { x: 58, y:  5, size: 2.5, op: 0.28, delay: 1.1, dur: 5.9, color: 'white'  },
  { x: 66, y: 77, size: 2,   op: 0.23, delay: 6.7, dur: 7.3, color: 'gold'   },
  { x: 73, y: 38, size: 3,   op: 0.27, delay: 3.4, dur: 6.1, color: 'cyan'   },
  { x: 81, y: 92, size: 2,   op: 0.24, delay: 0.5, dur: 8.7, color: 'purple' },
  { x: 88, y: 48, size: 2.5, op: 0.27, delay: 4.2, dur: 5.7, color: 'white'  },
  { x: 94, y: 30, size: 2,   op: 0.25, delay: 2.6, dur: 7.9, color: 'gold'   },
  { x:  3, y: 40, size: 2.5, op: 0.26, delay: 5.9, dur: 6.5, color: 'cyan'   },
];

// ── Shooting stars ────────────────────────────────────────────────────────
interface Shoot {
  id: number;
  startX: number;
  startY: number;
  dir: 1 | -1;
  duration: number;
  length: number;
  color: 'cyan' | 'gold';
}
let _shootId = 0;

// ── Canvas star data ──────────────────────────────────────────────────────
interface CStar {
  x: number; y: number; r: number;
  hue: number; speed: number; phase: number;
}

function buildCanvasStars(w: number, h: number, count: number): CStar[] {
  const hues = [195, 42, 270, 220, 38, 0]; // cyan, gold, purple, blue, amber, white
  return Array.from({ length: count }, () => {
    // weight toward edges — avoid center 30% of screen
    const edgeWeight = Math.random() < 0.65;
    let x: number, y: number;
    if (edgeWeight) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = Math.random() * w * 0.3;             y = Math.random() * h; }
      else if (side === 1) { x = w * 0.7 + Math.random() * w * 0.3; y = Math.random() * h; }
      else if (side === 2) { x = Math.random() * w;               y = Math.random() * h * 0.3; }
      else                 { x = Math.random() * w;               y = h * 0.7 + Math.random() * h * 0.3; }
    } else {
      x = Math.random() * w;
      y = Math.random() * h;
    }
    return {
      x, y,
      r: 0.3 + Math.random() * 1.5,
      hue: hues[Math.floor(Math.random() * hues.length)],
      speed: 0.4 + Math.random() * 1.2,   // twinkle frequency
      phase: Math.random() * Math.PI * 2,  // start offset
    };
  });
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const farRef    = useRef<HTMLDivElement>(null);
  const midRef    = useRef<HTMLDivElement>(null);
  const nearRef   = useRef<HTMLDivElement>(null);
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Canvas twinkling stars ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let stars: CStar[] = [];

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      stars = buildCanvasStars(canvas.width, canvas.height, 280);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ts = t * 0.001;
      for (const s of stars) {
        // sinusoidal brightness — each star at its own frequency + phase
        const brightness = 0.10 + 0.25 * (0.5 + 0.5 * Math.sin(ts * s.speed + s.phase));
        const alpha = reducedMotion ? 0.18 : brightness;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        // slight saturation for non-white hues, pure white for hue=0
        const sat = s.hue === 0 ? '0%' : '60%';
        ctx.fillStyle = `hsla(${s.hue}, ${sat}, 92%, ${alpha.toFixed(3)})`;
        ctx.fill();

        // soft glow for larger stars
        if (s.r > 1.0 && !reducedMotion) {
          const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
          grd.addColorStop(0, `hsla(${s.hue}, 70%, 85%, ${(alpha * 0.2).toFixed(3)})`);
          grd.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  // ── Mouse parallax ─────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;
    // Touch devices — skip
    if (window.matchMedia('(hover: none)').matches) return;

    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;

    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - cx);
      const dy = (e.clientY - cy);
      if (farRef.current)  farRef.current.style.transform  = `translate3d(${dx * 0.008}px, ${dy * 0.008}px, 0)`;
      if (midRef.current)  midRef.current.style.transform  = `translate3d(${dx * 0.015}px, ${dy * 0.015}px, 0)`;
      if (nearRef.current) nearRef.current.style.transform = `translate3d(${dx * 0.025}px, ${dy * 0.025}px, 0)`;
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [reducedMotion]);

  // ── Shooting stars ─────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;
    let cancelled = false;
    let timer: number | undefined;

    const spawn = () => {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const startX = dir === 1 ? -5 + Math.random() * 35 : 70 + Math.random() * 35;
      const startY = -5 + Math.random() * 40;
      const duration = 0.55 + Math.random() * 0.65;
      const length   = 160 + Math.random() * 140;
      const color: 'cyan' | 'gold' = Math.random() < 0.65 ? 'cyan' : 'gold';
      const id = ++_shootId;
      setShoots(prev => prev.length >= 3 ? prev : [...prev, { id, startX, startY, dir, duration, length, color }]);
      window.setTimeout(() => setShoots(prev => prev.filter(s => s.id !== id)), duration * 1000 + 300);
    };

    const schedule = () => {
      const delay = (6 + Math.random() * 12) * 1000; // 6–18 s
      timer = window.setTimeout(() => {
        if (cancelled) return;
        spawn();
        schedule();
      }, delay);
    };

    timer = window.setTimeout(() => {
      if (!cancelled) { spawn(); schedule(); }
    }, 3000 + Math.random() * 5000);

    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [reducedMotion]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">

      {/* Parallax layers */}
      <div ref={farRef}  className="space-layer space-layer-far"  />
      <div ref={midRef}  className="space-layer space-layer-mid"  />
      <div ref={nearRef} className="space-layer space-layer-near" />

      {/* Aurora */}
      <div className="space-aurora" />

      {/* Canvas — individually twinkling stars */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: 'screen' }}
      />

      {/* Noise grain */}
      <div className="space-noise" />

      {/* Accent stars */}
      <div className="absolute inset-0 pointer-events-none">
        {LARGE_STARS.map((s, i) => (
          <span
            key={i}
            className={`space-large-star star-${s.color}`}
            style={{
              left: `${s.x}%`,
              top:  `${s.y}%`,
              width:  `${s.size}px`,
              height: `${s.size}px`,
              ['--star-op' as string]:      s.op,
              ['--twinkle-dur' as string]:  `${s.dur}s`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Shooting stars */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {shoots.map(s => (
          <span
            key={s.id}
            className={`space-shooting-star shoot-${s.color} ${s.dir === 1 ? 'shoot-dir-r' : 'shoot-dir-l'}`}
            style={{
              left:   `${s.startX}%`,
              top:    `${s.startY}%`,
              width:  `${s.length}px`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
