/**
 * SpaceBackground — cinematic overlay for the space photograph background.
 *
 * The actual space image lives on `.main-content-gradient` (in index.css).
 * This component sits ABOVE it and adds subtle, premium-feel motion:
 *
 *   1. Animated starfield canvas — 3 depth layers, slow drift, twinkle.
 *   2. Two "fake planet rotation" overlays — soft-light radial gradients
 *      slowly rotating in opposite directions, masked to the planet zones.
 *   3. Mouse parallax — the whole layer translates ±10–15px; near layer
 *      moves more than far layer to create depth.
 *   4. Shooting stars — 1–2 active, randomized 15–40s intervals.
 *   5. Cinematic film-grain overlay (very faint).
 *
 * All layers are pointer-events:none and transform-only on GPU. The image
 * itself is never moved fast, scaled, or zoomed.
 *
 * Failsafes: respects `prefers-reduced-motion` and very low core counts.
 */
import { useEffect, useRef, useState } from 'react';

interface Shoot {
  id: number;
  startX: number;
  startY: number;
  dir: 1 | -1;
  duration: number;
  length: number;
}

let _shootId = 0;

const STAR_COUNT_FAR = 140;
const STAR_COUNT_MID = 90;
const STAR_COUNT_NEAR = 50;

interface Star {
  x: number; // 0..1
  y: number;
  r: number; // px radius
  baseAlpha: number;
  twinkleSpeed: number; // rad/sec
  twinklePhase: number;
  layer: 0 | 1 | 2; // 0=far, 1=mid, 2=near
  driftX: number; // px per second
  driftY: number;
  hue: number;
}

export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const farLayerRef = useRef<HTMLDivElement | null>(null);
  const midLayerRef = useRef<HTMLDivElement | null>(null);
  const nearLayerRef = useRef<HTMLDivElement | null>(null);
  const planetLeftRef = useRef<HTMLDivElement | null>(null);
  const planetRightRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const lastTimeRef = useRef<number>(0);
  const targetParallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentParallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [shoots, setShoots] = useState<Shoot[]>([]);
  const [reduced, setReduced] = useState(false);

  // ============================================================
  // Starfield + parallax animation loop
  // ============================================================
  useEffect(() => {
    const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowCore = (navigator.hardwareConcurrency ?? 4) < 2;
    if (prm || lowCore) {
      setReduced(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Build stars across 3 depth layers
    const buildStars = (): Star[] => {
      const out: Star[] = [];
      const layers: Array<{ count: number; layer: 0 | 1 | 2; rMin: number; rMax: number; alphaMin: number; alphaMax: number; driftMul: number }> = [
        { count: STAR_COUNT_FAR, layer: 0, rMin: 0.3, rMax: 0.8, alphaMin: 0.25, alphaMax: 0.55, driftMul: 0.4 },
        { count: STAR_COUNT_MID, layer: 1, rMin: 0.6, rMax: 1.2, alphaMin: 0.35, alphaMax: 0.7, driftMul: 0.9 },
        { count: STAR_COUNT_NEAR, layer: 2, rMin: 0.9, rMax: 1.8, alphaMin: 0.5, alphaMax: 0.95, driftMul: 1.6 },
      ];
      for (const L of layers) {
        for (let i = 0; i < L.count; i++) {
          const driftAngle = Math.random() * Math.PI * 2;
          const driftSpeed = (0.4 + Math.random() * 0.8) * L.driftMul; // px/sec
          out.push({
            x: Math.random(),
            y: Math.random(),
            r: L.rMin + Math.random() * (L.rMax - L.rMin),
            baseAlpha: L.alphaMin + Math.random() * (L.alphaMax - L.alphaMin),
            twinkleSpeed: 0.3 + Math.random() * 1.4, // rad/sec
            twinklePhase: Math.random() * Math.PI * 2,
            layer: L.layer,
            driftX: Math.cos(driftAngle) * driftSpeed,
            driftY: Math.sin(driftAngle) * driftSpeed,
            // Mostly cool white/blue, occasionally warm gold to match planet
            hue: Math.random() < 0.85 ? 200 : 38,
          });
        }
      }
      return out;
    };
    starsRef.current = buildStars();

    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // Mouse parallax — store target, lerp in the loop
    const onMouseMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      targetParallaxRef.current.x = nx * 14; // ±7px
      targetParallaxRef.current.y = ny * 14;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const tick = (now: number) => {
      const dtMs = lastTimeRef.current ? now - lastTimeRef.current : 16;
      lastTimeRef.current = now;
      const dt = Math.min(dtMs, 60) / 1000; // seconds, clamped

      // Smooth parallax (lerp toward target)
      const cur = currentParallaxRef.current;
      const tgt = targetParallaxRef.current;
      cur.x += (tgt.x - cur.x) * 0.06;
      cur.y += (tgt.y - cur.y) * 0.06;

      // Apply parallax to overlay layers (different intensity per depth)
      if (farLayerRef.current) {
        farLayerRef.current.style.transform = `translate3d(${cur.x * 0.3}px, ${cur.y * 0.3}px, 0)`;
      }
      if (midLayerRef.current) {
        midLayerRef.current.style.transform = `translate3d(${cur.x * 0.7}px, ${cur.y * 0.7}px, 0)`;
      }
      if (nearLayerRef.current) {
        nearLayerRef.current.style.transform = `translate3d(${cur.x * 1.4}px, ${cur.y * 1.4}px, 0)`;
      }
      // Planets move LESS than the background → adds depth illusion
      if (planetLeftRef.current) {
        planetLeftRef.current.style.transform = `translate3d(${cur.x * 0.15}px, ${cur.y * 0.15}px, 0)`;
      }
      if (planetRightRef.current) {
        planetRightRef.current.style.transform = `translate3d(${cur.x * 0.18}px, ${cur.y * 0.18}px, 0)`;
      }

      // Clear and redraw stars
      ctx.clearRect(0, 0, width, height);
      const t = now / 1000;
      const stars = starsRef.current;
      for (const s of stars) {
        // Drift
        s.x += (s.driftX * dt) / width;
        s.y += (s.driftY * dt) / height;
        if (s.x < -0.02) s.x += 1.04;
        else if (s.x > 1.02) s.x -= 1.04;
        if (s.y < -0.02) s.y += 1.04;
        else if (s.y > 1.02) s.y -= 1.04;

        // Twinkle (sine wave on alpha)
        const tw = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.twinklePhase);
        const alpha = s.baseAlpha * tw;

        const px = s.x * width;
        const py = s.y * height;
        const sat = s.hue === 38 ? 90 : 30;
        const light = s.hue === 38 ? 78 : 95;
        ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${light}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();

        // Subtle glow on near layer brightest stars
        if (s.layer === 2 && tw > 0.85) {
          ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${light}%, ${alpha * 0.18})`;
          ctx.beginPath();
          ctx.arc(px, py, s.r * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ============================================================
  // Shooting stars scheduler
  // ============================================================
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
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
      const startY = -5 + Math.random() * 35;
      const duration = 0.7 + Math.random() * 0.6;
      const length = 140 + Math.random() * 120;
      const id = ++_shootId;
      setShoots(prev => (prev.length >= 2 ? prev : [...prev, { id, startX, startY, dir, duration, length }]));
      window.setTimeout(() => {
        setShoots(prev => prev.filter(s => s.id !== id));
      }, duration * 1000 + 200);
    };

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

  if (reduced) {
    // No motion — the static space image background is enough.
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {/* === Fake planet rotation overlays ===
          The orange planet sits in the upper-left of the image; the blue
          planet sits in the lower-right. We mask radial-gradient textures
          to those zones and rotate them slowly in opposite directions. */}
      <div
        ref={planetLeftRef}
        className="absolute pointer-events-none"
        style={{
          left: '-8%',
          top: '-12%',
          width: '46%',
          aspectRatio: '1 / 1',
          willChange: 'transform',
        }}
      >
        <div className="space-planet-spin space-planet-spin-cw" />
      </div>
      <div
        ref={planetRightRef}
        className="absolute pointer-events-none"
        style={{
          right: '-10%',
          bottom: '-18%',
          width: '52%',
          aspectRatio: '1 / 1',
          willChange: 'transform',
        }}
      >
        <div className="space-planet-spin space-planet-spin-ccw space-planet-spin-blue" />
      </div>

      {/* === Star canvas layers ===
          We use a single canvas for all stars (simpler / cheaper) but keep
          three transform DIVs so mouse parallax can shift depth-relative
          overlays. The canvas itself sits at "mid" depth. */}
      <div ref={farLayerRef} className="absolute inset-0" style={{ willChange: 'transform' }} />
      <div ref={midLayerRef} className="absolute inset-0" style={{ willChange: 'transform' }}>
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      <div ref={nearLayerRef} className="absolute inset-0" style={{ willChange: 'transform' }} />

      {/* === Cinematic film grain (very faint) === */}
      <div className="space-noise" />

      {/* === Shooting stars === */}
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
