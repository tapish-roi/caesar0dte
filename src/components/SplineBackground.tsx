import { Suspense, lazy, useState } from 'react';

/**
 * SplineBackground — lazy-loads a Spline 3D scene as a fixed full-viewport
 * background layer behind the dashboard UI.
 *
 * Scene at `NUPw44thQYx9Wu19` ("Earth - day and night") is published from
 * the Spline editor; we render it as-is and apply a CSS transform on the
 * wrapper to frame Earth on the left of the viewport.
 *
 * Resize behavior: the canvas + transform + cutout are LOCKED to the
 * dimensions captured at first mount, so when the user minimizes / resizes
 * the window:
 *   • The Spline canvas keeps its original pixel size — Spline's runtime
 *     doesn't re-render at a new aspect ratio, so Earth stays put and the
 *     camera framing is preserved.
 *   • The `--earth-*` cutout CSS variables are written as fixed pixels
 *     (computed from the initial viewport % targets) so the mask circle
 *     also stays anchored to Earth's pixel position.
 *   • The UI (cards, sidebar, etc.) uses its own responsive layout and
 *     reflows over the still background.
 *
 * Layering: `position: fixed; top: 0; left: 0; z-[-1]` — sits behind every
 * in-flow UI child while the parent dashboard div uses `isolation-isolate`
 * so the negative z stays inside its stacking context. The starfield
 * (`SpaceBackground`, z-[5]) layers stars + nebula on top with screen blend.
 */

const Spline = lazy(() => import('@splinetool/react-spline'));

const SCENE_URL = 'https://prod.spline.design/NUPw44thQYx9Wu19/scene.splinecode';

// Framing constants — applied as fixed pixel transforms derived from the
// initial viewport size, so the scene doesn't shift when the window resizes.
const FRAME = {
  scale: 2.4,
  offsetXFrac: -0.18, // wrapper translateX as a fraction of initial width
};

function getInitialDims() {
  if (typeof window === 'undefined') {
    return { w: 1920, h: 1080 };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

export default function SplineBackground() {
  // Capture viewport dimensions ONCE on first render — never updated on
  // resize, which locks the Spline canvas at its original pixel size and
  // prevents the Spline runtime from re-rendering at a new aspect ratio.
  const [dims] = useState(getInitialDims);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 overflow-hidden z-[-1]"
      style={{ width: dims.w, height: dims.h }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${dims.w * FRAME.offsetXFrac}px) scale(${FRAME.scale})`,
          transformOrigin: 'center center',
        }}
      >
        <Suspense fallback={null}>
          <Spline scene={SCENE_URL} style={{ width: '100%', height: '100%' }} />
        </Suspense>
      </div>
    </div>
  );
}
