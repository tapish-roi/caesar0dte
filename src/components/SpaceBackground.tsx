import { useEffect, useRef } from "react";

/**
 * SpaceBackground — premium ambient background system.
 *
 * Three composited layers, all behind UI (z-index: 0, pointer-events: none):
 *   1. Animated gradient mesh — slow, smooth, deep blue / teal / hint of purple
 *   2. Light flow streaks    — very low opacity diagonal energy waves
 *   3. Particle field        — tiny abstract dots on a single <canvas>, slow drift
 *
 * Rules respected:
 *  - Sits BELOW UI (z-0). UI must be position: relative; z-10+.
 *  - pointer-events: none — never intercepts input.
 *  - No mix-blend-mode on UI; layers use `screen` only between themselves.
 *  - GPU-accelerated transforms; canvas paints at most ~80 small particles.
 *  - Honors prefers-reduced-motion (animations paused, particles static).
 */
export default function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number };
    let particles: P[] = [];

    const buildParticles = () => {
      // Density tuned for performance: ~1 particle per ~24k px², capped.
      const count = Math.min(80, Math.max(30, Math.floor((width * height) / 24000)));
      particles = new Array(count).fill(0).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.4, // 0.4–1.8 px
        vx: (Math.random() - 0.5) * 0.06, // very slow drift
        vy: (Math.random() - 0.5) * 0.06,
        a: Math.random() * 0.35 + 0.15, // 0.15–0.50 base opacity
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildParticles();
    };

    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    let t = 0;

    const draw = (now: number) => {
      const dt = Math.min(64, now - last); // clamp big gaps (tab switch)
      last = now;
      t += dt * 0.001;

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        if (!reduceMotion) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -2) p.x = width + 2;
          else if (p.x > width + 2) p.x = -2;
          if (p.y < -2) p.y = height + 2;
          else if (p.y > height + 2) p.y = -2;
        }
        // Subtle twinkle: slow opacity pulse, unique phase per particle.
        const twinkle = reduceMotion
          ? 1
          : 0.75 + 0.25 * Math.sin(t * 0.6 + p.x * 0.013 + p.y * 0.011);
        ctx.beginPath();
        ctx.fillStyle = `hsla(195, 40%, 92%, ${p.a * twinkle})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* 1) Animated gradient mesh — slow shifting, smooth blending */}
      <div className="ambient-gradient" />

      {/* 2) Light flow — very subtle diagonal energy streaks */}
      <div className="ambient-flow" />

      {/* 3) Particle field — tiny abstract dots, slow drift + faint twinkle */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
