/**
 * LightspeedTransition — cinematic hyperspace jump overlay.
 *
 * Plays a 3-phase canvas animation:
 *   A) Build-up  (~0.4s) — stars brighten and pull toward center
 *   B) Warp      (~0.7s) — stars stretch into streaks, accelerating outward
 *   C) Exit      (~0.4s) — streaks fade, brightness drops, cross-fade to dashboard
 *
 * Total ~1.5s. Self-removes via `onDone` callback.
 * GPU-friendly: single <canvas>, transform-only DOM.
 *
 * Failsafe: detects low-FPS devices (prefers-reduced-motion or low core count)
 * and falls back to a plain 0.3s fade.
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  onDone: () => void;
}

interface Star {
  x: number; // [-1, 1] normalized
  y: number;
  z: number; // depth, [0, 1]
  pz: number; // previous z for trail
}

const STAR_COUNT = 320;
const TOTAL_MS = 1500;
const PHASE_A_END = 0.27; // 0..0.27 build-up
const PHASE_B_END = 0.78; // 0.27..0.78 warp
// 0.78..1 exit fade

export default function LightspeedTransition({ onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Failsafe — reduced motion or very low core count → simple fade
    const prm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowCore = (navigator.hardwareConcurrency ?? 4) < 2;
    if (prm || lowCore) {
      setReduced(true);
      const t = setTimeout(onDone, 320);
      return () => clearTimeout(t);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      const t = setTimeout(onDone, 320);
      return () => clearTimeout(t);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();

    // Init stars
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => {
      const z = Math.random();
      return {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z,
        pz: z,
      };
    });

    // Theme colors (blue/teal). Use HSL strings directly to skip layout reads.
    // bg fade: deep navy. streak: cyan-white core, blue periphery.
    const draw = (t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Phase progress
      let phaseA = 0; // 0..1 within build-up
      let phaseB = 0; // 0..1 within warp
      let phaseC = 0; // 0..1 within exit
      if (t < PHASE_A_END) phaseA = t / PHASE_A_END;
      else if (t < PHASE_B_END) {
        phaseA = 1;
        phaseB = (t - PHASE_A_END) / (PHASE_B_END - PHASE_A_END);
      } else {
        phaseA = 1;
        phaseB = 1;
        phaseC = (t - PHASE_B_END) / (1 - PHASE_B_END);
      }

      // Background — darken & fade out at end
      const bgAlpha = phaseC < 1 ? 1 : 0;
      // Use a slight motion-blur trail by drawing semi-transparent fill instead of clear
      const trailAlpha = 0.18 + phaseB * 0.22; // less clearing → longer streaks during warp
      ctx.fillStyle = `hsla(220, 45%, 4%, ${trailAlpha * bgAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // Speed curve — accelerates through phase B with ease-in
      // base speed creeps up in A, ramps hard in B, decays in C
      const speedA = 0.002 + phaseA * 0.008;
      const speedB = 0.01 + Math.pow(phaseB, 1.6) * 0.085;
      const speedC = 0.095 * (1 - phaseC * 0.6);
      const speed = phaseC > 0 ? speedC : phaseB > 0 ? speedB : speedA;

      // Brightness ramp
      const brightness =
        phaseC > 0
          ? 1 - phaseC * 0.85
          : phaseB > 0
          ? 0.7 + phaseB * 0.3
          : 0.4 + phaseA * 0.3;

      const exitFade = 1 - phaseC; // streaks fade away

      ctx.lineCap = 'round';

      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          s.pz = 1;
        }

        // Project current and previous positions
        const k = 1 / s.z;
        const pk = 1 / s.pz;
        const sx = cx + s.x * k * cx;
        const sy = cy + s.y * k * cy;
        const psx = cx + s.x * pk * cx;
        const psy = cy + s.y * pk * cy;

        // Cull off-screen
        if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue;

        // Streak length grows with phaseB
        const lineWidth = (1 - s.z) * 2.2 * dpr * (0.4 + brightness * 0.9);
        const alpha = Math.min(1, (1 - s.z) * 1.6) * brightness * exitFade;

        // Color: warm cyan core during warp, cooler steel-blue otherwise
        const hue = 195 - phaseB * 10; // 195 -> 185 (slight teal shift)
        const sat = 70 + phaseB * 25;

        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${78 + phaseB * 12}%, ${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(psx, psy);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // Tiny bright core dot for dense feel during warp
        if (phaseB > 0.4 && s.z < 0.4) {
          ctx.fillStyle = `hsla(190, 100%, 95%, ${alpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(sx, sy, lineWidth * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Center tunnel glow during warp
      if (phaseB > 0 && phaseC < 1) {
        const glowR = Math.max(w, h) * (0.12 + phaseB * 0.35);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glow.addColorStop(0, `hsla(190, 100%, 90%, ${0.18 * phaseB * exitFade})`);
        glow.addColorStop(0.5, `hsla(200, 90%, 60%, ${0.08 * phaseB * exitFade})`);
        glow.addColorStop(1, 'hsla(220, 60%, 10%, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
      }
    };

    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / TOTAL_MS);
      draw(t);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Slight delay so the dashboard can render under the fade
        onDone();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [onDone]);

  if (reduced) {
    return (
      <div
        className="fixed inset-0 z-[9999] pointer-events-auto bg-background animate-fade-in"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-auto"
      aria-hidden="true"
      style={{ background: 'transparent' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
