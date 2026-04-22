import { useEffect, useRef } from 'react';
import plutoImg from '@/assets/pluto.png';
import moonImg from '@/assets/moon.png';

/**
 * SpaceBackground — cinematic deep-space ambience with reactive lighting.
 *
 * Layers (back → front, all behind UI, pointer-events: none):
 *   1. Void wash         — deep base color
 *   2. Far stars         — tiny dense, slowest drift
 *   3. Mid star layer    — varied sizes with color
 *   4. Nebula            — soft animated color washes
 *   5. Near stars        — sparse warm/cool, fastest
 *   6. Twinkle overlay   — pulsing brighter stars
 *   7. Pluto + Moon      — hero celestial bodies (axial-tilt 3D rotation)
 *   8. Cursor light      — radial light following the pointer (subtle)
 *   9. Depth fog         — corner vignette + atmospheric blend
 *  10. Shooting star     — rare cinematic accent
 *  11. Fine grain noise  — banding killer
 *
 * Reactive system (RAF-throttled, no React re-renders):
 *   --mx / --my   → normalized [-1, 1] mouse position (parallax)
 *   --cx / --cy   → absolute mouse pixel position (cursor light)
 *   --pluto-prox  → 0..1 proximity to Pluto center (boosts glow)
 *   --moon-prox   → 0..1 proximity to Moon center
 *   --cursor-glow → 0..1 written to <html> for global UI glow integration
 */
export default function SpaceBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const plutoWrapRef = useRef<HTMLDivElement>(null);
  const moonWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Still center the cursor light statically so cards don't look dark.
      root.style.setProperty('--cx', `${window.innerWidth / 2}px`);
      root.style.setProperty('--cy', `${window.innerHeight / 2}px`);
      return;
    }

    const docEl = document.documentElement;
    let raf = 0;
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    // Smoothed values — easing creates the "soft light catches up" feel
    let sx = cx;
    let sy = cy;
    let plutoProx = 0;
    let moonProx = 0;

    const apply = () => {
      raf = 0;
      // Easing toward target — premium "physical" feel, not snappy
      sx += (cx - sx) * 0.12;
      sy += (cy - sy) * 0.12;

      const nx = (sx / window.innerWidth) * 2 - 1;
      const ny = (sy / window.innerHeight) * 2 - 1;

      root.style.setProperty('--mx', nx.toFixed(3));
      root.style.setProperty('--my', ny.toFixed(3));
      root.style.setProperty('--cx', `${sx.toFixed(1)}px`);
      root.style.setProperty('--cy', `${sy.toFixed(1)}px`);

      // Proximity to planet centers (0 = far, 1 = on it)
      const computeProx = (el: HTMLElement | null) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        const px = r.left + r.width / 2;
        const py = r.top + r.height / 2;
        const dx = sx - px;
        const dy = sy - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Falloff radius scaled to viewport — wide and smooth
        const falloff = Math.max(window.innerWidth, window.innerHeight) * 0.55;
        return Math.max(0, 1 - dist / falloff);
      };

      const newPluto = computeProx(plutoWrapRef.current);
      const newMoon = computeProx(moonWrapRef.current);
      // Smooth proximity too — avoids any micro-jitter
      plutoProx += (newPluto - plutoProx) * 0.18;
      moonProx += (newMoon - moonProx) * 0.18;

      root.style.setProperty('--pluto-prox', plutoProx.toFixed(3));
      root.style.setProperty('--moon-prox', moonProx.toFixed(3));

      // Global cursor-glow signal for cards / UI (read on <html>)
      docEl.style.setProperty('--cursor-glow', plutoProx.toFixed(3));

      // Continue easing if still settling
      if (
        Math.abs(cx - sx) > 0.3 ||
        Math.abs(cy - sy) > 0.3 ||
        Math.abs(newPluto - plutoProx) > 0.005 ||
        Math.abs(newMoon - moonProx) > 0.005
      ) {
        raf = requestAnimationFrame(apply);
      }
    };

    const onMove = (e: MouseEvent) => {
      cx = e.clientX;
      cy = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      // Drift the light gently to center when cursor leaves the window
      cx = window.innerWidth / 2;
      cy = window.innerHeight / 2;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    // Initial paint
    raf = requestAnimationFrame(apply);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      docEl.style.removeProperty('--cursor-glow');
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      /* z-0 + pointer-events-none keep this strictly behind UI. UI elements
         use z-10+ (and position: relative on wrappers via Tailwind defaults
         like `relative`). Background elements MUST NEVER capture input. */
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{
        ['--mx' as string]: 0,
        ['--my' as string]: 0,
        ['--cx' as string]: '50vw',
        ['--cy' as string]: '50vh',
        ['--pluto-prox' as string]: 0,
        ['--moon-prox' as string]: 0,
      }}
    >
      {/* Deep space base wash */}
      <div className="space-void" />

      {/* Far layer — tiny dense distant stars */}
      <div className="space-layer space-layer-far" />

      {/* Mid star layer */}
      <div className="space-layer space-layer-mid-stars" />

      {/* Nebula */}
      <div className="space-layer space-layer-nebula" />

      {/* Near layer */}
      <div className="space-layer space-layer-near" />

      {/* Twinkle overlay */}
      <div className="space-layer space-layer-twinkle" />

      {/* Hero celestial body #1 — Pluto, top-left */}
      <div className="space-pluto-wrap" ref={plutoWrapRef}>
        <div className="space-pluto-glow" />
        <div className="space-pluto-tilt">
          <div className="space-pluto-axis">
            <div className="space-pluto-sphere">
              <img
                src={plutoImg}
                alt=""
                className="space-pluto"
                draggable={false}
                loading="lazy"
                width={1024}
                height={1024}
              />
              <div className="space-pluto-terminator" />
              {/* Reactive specular highlight — brightens the side facing the cursor */}
              <div className="space-pluto-spec" />
            </div>
          </div>
        </div>
      </div>

      {/* Hero celestial body #2 — Moon, bottom-right */}
      <div className="space-moon-wrap" ref={moonWrapRef}>
        <div className="space-moon-glow" />
        <div className="space-moon-tilt">
          <div className="space-moon-axis">
            <div className="space-moon-sphere">
              <img
                src={moonImg}
                alt=""
                className="space-moon"
                draggable={false}
                loading="lazy"
                width={1024}
                height={1024}
              />
              <div className="space-moon-terminator" />
              <div className="space-moon-spec" />
            </div>
          </div>
        </div>
      </div>

      {/* Cursor-following radial light — soft, low opacity, smooth falloff */}
      <div className="space-cursor-light" />

      {/* Atmospheric depth fog — corner vignette blending planets, stars, UI */}
      <div className="space-fog" />

      {/* Rare shooting star */}
      <div className="space-shooting-star" />

      {/* Fine grain noise */}
      <div className="space-noise" />
    </div>
  );
}
