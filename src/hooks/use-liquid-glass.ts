import { useEffect, useRef } from 'react';

/**
 * Attaches a cursor-tracked specular highlight to a Liquid Glass surface.
 *
 * Returns a ref to spread onto the element that also carries the
 * `.liquid-glass` / `.liquid-glass-sidebar` class. While the pointer hovers
 * the element, it writes `--mx` / `--my` (as percentages) so the `::before`
 * radial-gradient sheen follows the cursor. Updates are rAF-throttled.
 *
 * No-op (and no listeners attached) when the user prefers reduced motion.
 */
export function useLiquidGlass<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };

    el.addEventListener('pointermove', onMove);
    return () => {
      el.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}
