/* Students-tab tutorial — an animated, Hebrew, screen-recording-style walkthrough
   of the mentor "תלמידים" tab.

   Deliberately NOT a video file: there is no mp4, no gif and no image texture
   anywhere here. Every frame is drawn live from code (DOM + CSS, driven by a
   requestAnimationFrame timeline), so the whole tutorial costs ~0 bytes of
   Supabase storage and no bandwidth beyond the JS bundle. Re-recording it means
   editing the scene table below, not re-uploading a file.

   Ported from the Claude Design composition "Students Tab Tutorial.dc.html"
   (project 9662dde3-b243-45f2-b989-058d89f112b0). The UI inside the stage is a
   1:1 static recreation of the real students tab (MentorDashboard.tsx) at a
   fixed 1280×720 canvas which is then scaled to fit the dialog — that keeps the
   choreography pixel-stable regardless of the viewer's screen size.

   The design's WebGL Mars background was replaced with a pure-CSS replica for
   the same reason (the original needed textures/mars.jpg + night_sky.png). */

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { GraduationIcon, PauseIcon, PlayIcon, ResetIcon } from '@/components/icons';
import type { SceneApi } from '@/components/planet-background/scene';

/* ── exact tokens (index.css) ─────────────────────────────── */
const C = {
  spaceBg: 'radial-gradient(circle at 30% 28%, #0a1a34 0%, #060a18 55%, #03040c 100%)',
  lgBg: 'hsla(200,42%,13%,0.72)',            // --lg-bg (cards)
  lgBgStrong: 'hsla(220,34%,11%,0.52)',      // --lg-bg-strong (sidebar)
  lgBorder: 'hsla(195,45%,60%,0.16)',        // --lg-border
  lgHighlight: 'hsla(0,0%,100%,0.10)',       // --lg-highlight
  lgInner: 'hsla(0,0%,100%,0.08)',
  lgShadow: '0 8px 34px rgba(0,0,0,0.34), inset 0 1px 0 hsla(0,0%,100%,0.06)',
  surface: 'hsl(210,43%,9%)',                // --surface
  border: 'hsl(197,28%,26%)',                // --border
  muted: 'hsl(205,40%,12%)',                 // --muted
  mutedFg: 'hsl(195,19%,68%)',               // --muted-foreground
  fg: 'hsl(194,26%,90%)',                    // --foreground
  primary: 'hsl(42,72%,60%)',                // --primary
  primaryFg: 'hsl(44,74%,7%)',               // --primary-foreground
  destructive: 'hsl(350,89%,60%)',           // --destructive
  sideBorder: 'hsl(200,22%,20%)',            // --sidebar-border
  gold: '#e2b54e',
  bg: '#03040c',
};
const R = { lg: 16, md: 14, xl: 16, x2: 20 };
const FONT = "'IBM Plex Sans Hebrew','Heebo','Segoe UI',system-ui,sans-serif";

const STAGE_W = 1280;
const STAGE_H = 720;

/* ── lucide icon paths (inlined so the stage stays self-contained) ── */
type IconPart = string | { c: [number, number, number] } | { r: [number, number, number, number, number] };
const P: Record<string, IconPart[]> = {
  trend: ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'],
  book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', { c: [9, 7, 4] }, 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  cap: ['M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z', 'M22 10v6', 'M6 12.5V16a6 3 0 0 0 12 0v-3.5'],
  video: ['m22 8-6 4 6 4V8Z', { r: [2, 6, 14, 12, 2] }],
  msgQ: ['M7.9 20A9 9 0 1 0 4 16.1L2 22Z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  clip: [{ r: [8, 2, 8, 4, 1] }, 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M12 11h4', 'M12 16h4', 'M8 11h.01', 'M8 16h.01'],
  calc: [{ r: [4, 2, 16, 20, 2] }, 'M8 6h8', 'M16 14v4', 'M16 10h.01', 'M12 10h.01', 'M8 10h.01', 'M12 14h.01', 'M8 14h.01', 'M12 18h.01', 'M8 18h.01'],
  out: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  send: ['m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M3 21v-5h5'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'm9 12 2 2 4-4'],
  lock: [{ r: [3, 11, 18, 11, 2] }, 'M7 11V7a5 5 0 0 1 10 0v4'],
  unlock: [{ r: [3, 11, 18, 11, 2] }, 'M7 11V7a5 5 0 0 1 9.9-1'],
};

function Ic({ d, s = 16, col = 'currentColor', sw = 2, style }: {
  d: IconPart[]; s?: number; col?: string; sw?: number; style?: React.CSSProperties;
}) {
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}
    >
      {d.map((p, i) =>
        typeof p === 'string' ? <path key={i} d={p} />
          : 'c' in p ? <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} />
            : <rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} />)}
    </svg>
  );
}

/* ── math helpers ─────────────────────────────────────────── */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const EZ = (k: number) => { const v = clamp01(k); return v * v * (3 - 2 * v); };
const seg = (t: number, a: number, b: number) => EZ((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* ── element registry (offset-chain coords, transform-immune) ──
   Positions are read off the un-scaled 1280×720 stage via offsetLeft/offsetTop,
   so the camera's transform on the wrapper never feeds back into the maths. */
const REG = new Map<string, HTMLElement>();
const reg = (id: string) => (el: HTMLElement | null) => { if (el) REG.set(id, el); };

function posOf(id: string) {
  const el = REG.get(id);
  if (!el || !el.isConnected) return null;
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && !(n.dataset && n.dataset.stageRoot)) {
    x += n.offsetLeft; y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (!n) return null;
  return { cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
}

type Target = [number, number] | { id: string; o?: [number, number]; fb?: string };
function resolvePt(tg: Target) {
  if (Array.isArray(tg)) return { x: tg[0], y: tg[1] };
  const o = tg.o || [0, 0];
  const p = posOf(tg.id) || (tg.fb ? posOf(tg.fb) : null);
  if (!p) return { x: 640, y: 360 };
  return { x: p.cx + o[0], y: p.cy + o[1] };
}
const T = (id: string, o?: [number, number], fb?: string): Target => ({ id, o, fb });

type Stop = [number, Target];
type CamState = { z: number; tg: Target };
type CamStop = [number, CamState];

function cursorAt(t: number, stops: Stop[]) {
  if (t <= stops[0][0]) return resolvePt(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, g0] = stops[i], [t1, g1] = stops[i + 1];
    if (t <= t1) {
      const k = EZ((t - t0) / (t1 - t0));
      const a = resolvePt(g0), b = resolvePt(g1);
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
    }
  }
  return resolvePt(stops[stops.length - 1][1]);
}

function camAt(t: number, stops: CamStop[]) {
  const res = (s: CamState) => { const p = resolvePt(s.tg); return { z: s.z, x: p.x, y: p.y }; };
  let out = res(stops[stops.length - 1][1]);
  if (t <= stops[0][0]) out = res(stops[0][1]);
  else {
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, s0] = stops[i], [t1, s1] = stops[i + 1];
      if (t <= t1) {
        const k = EZ((t - t0) / (t1 - t0));
        const a = res(s0), b = res(s1);
        out = { z: lerp(a.z, b.z, k), x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
        break;
      }
    }
  }
  const hw = 640 / out.z, hh = 360 / out.z;
  return {
    z: out.z,
    cx: Math.min(Math.max(out.x, hw), STAGE_W - hw),
    cy: Math.min(Math.max(out.y, hh), STAGE_H - hh),
  };
}
const pressAt = (t: number, clicks: number[]) => clicks.some((c) => Math.abs(t - c) < 0.14);

/* ── cursor, ripples, caption ─────────────────────────────── */
function Cursor({ x, y, press }: { x: number; y: number; press: boolean }) {
  return (
    <svg
      width="27" height="27" viewBox="0 0 24 24"
      style={{
        position: 'absolute', left: x - 5.6, top: y - 2.2, pointerEvents: 'none', zIndex: 60,
        transform: press ? 'scale(0.82)' : 'scale(1)', transformOrigin: '22% 9%',
        filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
      }}
    >
      <path
        d="M5 2 5 19.8 9.7 15.6 12.4 21.9 15.2 20.7 12.5 14.5 18.6 14 Z"
        fill="#fff" stroke="#1b1b1f" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  );
}

function Ripples({ t, clicks, stops }: { t: number; clicks: number[]; stops: Stop[] }) {
  return (
    <>
      {clicks.map((ct, i) => {
        const k = (t - ct) / 0.5;
        if (k < 0 || k > 1) return null;
        const p = cursorAt(ct, stops);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: p.x - 24, top: p.y - 24, width: 48, height: 48, borderRadius: '50%',
              border: '2.5px solid ' + C.gold, opacity: (1 - k) * 0.85,
              transform: `scale(${0.25 + k * 1.15})`, pointerEvents: 'none', zIndex: 55,
            }}
          />
        );
      })}
    </>
  );
}

function Caption({ text, step, p }: { text?: string; step: number; p: number }) {
  if (!text) return null;
  const o = seg(p, 0.05, 0.17) * (1 - seg(p, 0.88, 0.97));
  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 30, display: 'flex', justifyContent: 'center',
        pointerEvents: 'none', opacity: o, transform: `translateY(${(1 - seg(p, 0.05, 0.17)) * 12}px)`, zIndex: 80,
      }}
    >
      <div
        dir="rtl"
        style={{
          display: 'flex', alignItems: 'center', gap: 14, backgroundColor: 'hsla(200,42%,11%,0.95)',
          backgroundImage: `linear-gradient(to bottom, ${C.lgHighlight}, transparent 32%)`,
          border: '1px solid rgba(226,181,78,0.35)', borderRadius: R.lg, padding: '12px 22px',
          boxShadow: C.lgShadow, maxWidth: 1000,
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: C.primary, color: C.primaryFg,
          fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{step}</div>
        <div style={{ color: C.fg, fontSize: 21, fontWeight: 500, textAlign: 'right', lineHeight: 1.35 }}>{text}</div>
      </div>
    </div>
  );
}

const Caret = ({ on, t, h = 18 }: { on?: boolean; t: number; h?: number }) => (
  <span style={{
    display: 'inline-block', width: 1.6, height: h, background: C.gold,
    marginInlineStart: 2, verticalAlign: 'middle', opacity: on && (t % 0.9 < 0.5) ? 1 : 0,
  }} />
);

/* ── space background — the site's OWN WebGL scene, not a replica.
   Same module the dashboard renders behind every tab (planet-background/scene.ts),
   mounted on a 1280×720 canvas inside the stage and set to Mars, which is the
   planet the students tab uses. Because the scene lays the planet out from
   canvas.clientWidth at a fixed NDC of -0.88, a 16:9 canvas puts Mars exactly
   where the choreography expects it. The textures already ship in public/, and
   three.js is the same lazy chunk the dashboard already loaded — so this costs
   no extra storage and, in practice, no extra download.

   Memoised with no props so the 60fps scene re-renders never remount it. */
const SpaceBG = React.memo(function SpaceBG() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const apiRef = React.useRef<SceneApi | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createPlanetScene } = await import('@/components/planet-background/scene');
        if (cancelled || !canvasRef.current) return;
        apiRef.current = createPlanetScene(canvasRef.current);
        apiRef.current.setPlanet('mars');
      } catch (err) {
        // No WebGL — the deep-space gradient underneath stays visible, exactly
        // like PlanetBackground's own fallback.
        console.error('StudentsTabTutorial: planet scene unavailable', err);
      }
    })();
    return () => { cancelled = true; apiRef.current?.destroy(); apiRef.current = null; };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', background: C.spaceBg }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: STAGE_W, height: STAGE_H }} />
    </div>
  );
});

/* ── recreated Students tab UI ────────────────────────────── */
const NAV = [
  { d: P.book, l: 'שיעורים' }, { d: P.users, l: 'קהילה' }, { d: P.cap, l: 'תלמידים', active: true },
  { d: P.video, l: 'Zoom' }, { d: P.msgQ, l: 'שאלות' }, { d: P.clip, l: 'מבחנים' }, { d: P.calc, l: 'מחשבון מסחר' },
];
const MEMBERS = [
  { name: 'חנניה וקנין', mail: 'chananya.v@gmail.com', date: '12.5.2026' },
  { name: 'חננאל', mail: 'hananel.t@gmail.com', date: '3.6.2026' },
];
const CATS: [string, number][] = [['יסודות ה־0DTE', 8], ['אסטרטגיות מתקדמות', 12], ['ניהול סיכונים', 5]];

type UIState = {
  t: number;
  email: string; inputFocus: boolean; sendPressed: boolean; pendingP: number;
  resendHover: boolean; trashInvHover: boolean;
  rowHover0: boolean; rowHover1: boolean;
  nickEditing: boolean; nickText: string; nickApplied: boolean;
  shieldHover0: boolean; panelP: number;
  grant0: boolean; grant1: boolean; grantHover: number | null;
  trashHover1: boolean; closeHover: boolean;
};
const BASE: UIState = {
  t: 0, email: '', inputFocus: false, sendPressed: false, pendingP: 0, resendHover: false,
  trashInvHover: false, rowHover0: false, rowHover1: false, nickEditing: false, nickText: '',
  nickApplied: false, shieldHover0: false, panelP: 0, grant0: false, grant1: false,
  grantHover: null, trashHover1: false, closeHover: false,
};
const U = (o: Partial<UIState>): UIState => ({ ...BASE, ...o });

function Card({ id, style, children }: { id?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      ref={id ? reg(id) : undefined}
      style={{
        backgroundColor: C.lgBg, backgroundImage: `linear-gradient(to bottom, ${C.lgHighlight}, transparent 32%)`,
        backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid ' + C.lgBorder, borderRadius: R.xl, padding: 24, boxShadow: C.lgShadow, ...style,
      }}
    >{children}</div>
  );
}

function IconBtn({ id, d, size = 28, icon = 14, col, hoverBg, hover, style }: {
  id: string; d: IconPart[]; size?: number; icon?: number; col?: string;
  hoverBg?: string; hover?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div
      ref={reg(id)}
      style={{
        width: size, height: size, borderRadius: R.md, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: col, background: hover ? hoverBg : 'transparent', flexShrink: 0, ...style,
      }}
    ><Ic d={d} s={icon} /></div>
  );
}

function StudentsTabUI({ ui }: { ui: UIState }) {
  const nick = ui.nickApplied;
  return (
    <div
      ref={reg('root')}
      data-stage-root="1"
      dir="rtl"
      style={{
        position: 'relative', width: STAGE_W, height: STAGE_H, background: C.bg, overflow: 'hidden',
        fontFamily: FONT, direction: 'rtl', color: C.fg, lineHeight: 1.6,
      }}
    >
      <SpaceBG />

      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {/* sidebar — .liquid-glass-sidebar */}
        <aside style={{
          position: 'relative', width: 256, height: STAGE_H, overflow: 'hidden', flexShrink: 0,
          borderInlineEnd: '1px solid ' + C.lgBorder,
          boxShadow: 'inset 0 1px 0 ' + C.lgInner + ', -4px 0 30px rgba(0,0,0,0.28)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: C.lgBgStrong,
            backgroundImage: `linear-gradient(to bottom, ${C.lgHighlight}, transparent 16%), linear-gradient(to bottom, transparent 70%, hsla(220,40%,4%,0.22))`,
            backdropFilter: 'blur(36px) saturate(180%)', WebkitBackdropFilter: 'blur(36px) saturate(180%)',
          }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 20, borderBottom: '1px solid ' + C.sideBorder, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: R.lg - 6, background: C.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Ic d={P.trend} s={20} col={C.primaryFg} sw={2.2} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'right', letterSpacing: '-0.022em' }}>Caesar 0 DTE</div>
                <div style={{ fontSize: 12, color: C.mutedFg, textAlign: 'right' }}>מנטור</div>
              </div>
            </div>
            <nav style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {NAV.map((it, i) => (
                <div
                  key={i}
                  ref={it.active ? reg('nav-students') : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: R.lg,
                    fontSize: 14, fontWeight: 500,
                    color: it.active ? C.fg : C.mutedFg,
                    backgroundColor: it.active ? 'hsla(200,40%,20%,0.32)' : 'transparent',
                    backgroundImage: it.active
                      ? `linear-gradient(180deg, hsla(42,72%,60%,0.16), hsla(42,72%,60%,0.04)), linear-gradient(to bottom, ${C.lgHighlight}, transparent 55%)`
                      : 'none',
                    border: it.active ? '1px solid hsla(42,72%,60%,0.24)' : '1px solid transparent',
                    boxShadow: it.active ? `inset 0 1px 0 ${C.lgInner}, 0 2px 12px -3px hsla(42,72%,60%,0.30)` : 'none',
                    textShadow: it.active
                      ? '0 0 10px hsla(42,72%,60%,0.42), 0 0 22px hsla(42,72%,60%,0.22), 0 0 36px hsla(42,72%,60%,0.10)'
                      : '0 0 6px hsla(195,19%,68%,0.18), 0 0 14px hsla(195,19%,68%,0.08)',
                  }}
                >
                  <Ic d={it.d} s={16} />
                  <span style={it.active ? {
                    flex: 1, textAlign: 'right',
                    background: `linear-gradient(180deg, ${C.fg} 0%, hsla(42,72%,60%,0.92) 100%)`,
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  } : { flex: 1, textAlign: 'right' }}>{it.l}</span>
                </div>
              ))}
            </nav>
            <div style={{ borderTop: '1px solid ' + C.sideBorder, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'hsla(42,72%,60%,0.2)', color: C.primary,
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>C</div>
              <div style={{
                flex: 1, fontSize: 12, fontWeight: 500, textAlign: 'right', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>caesar@0dte.com</div>
              <Ic d={P.out} s={16} col={C.mutedFg} />
            </div>
          </div>
        </aside>

        {/* main */}
        <main style={{ flex: 1, padding: 32, overflow: 'hidden' }}>
          <div style={{ maxWidth: 740 }}>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.022em', textAlign: 'right', lineHeight: 1.35 }}>תלמידים</h1>
              <div style={{ fontSize: 14, color: C.mutedFg, marginTop: 4, textAlign: 'right' }}>2 תלמידים רשומים</div>
            </div>

            {/* invite card */}
            <Card id="card-invite" style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, fontSize: 16, textAlign: 'right', marginBottom: 4 }}>הזמן תלמיד לקהילה</div>
              <div style={{ fontSize: 14, color: C.mutedFg, marginBottom: 16, textAlign: 'right' }}>הכנס אימייל של התלמיד</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  ref={reg('inp-invite')}
                  style={{
                    flex: 1, height: 44, borderRadius: R.lg, background: C.surface, padding: '0 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                    boxShadow: ui.inputFocus ? `0 0 0 2px ${C.primary}` : `0 0 0 1px ${C.border}`,
                  }}
                >
                  {ui.email
                    ? <span dir="ltr" style={{ fontSize: 14, color: C.fg, display: 'flex', alignItems: 'center' }}>{ui.email}<Caret on={ui.inputFocus} t={ui.t} /></span>
                    : <span style={{ fontSize: 14, color: C.mutedFg, display: 'flex', alignItems: 'center' }}><Caret on={ui.inputFocus} t={ui.t} />אימייל@example.com</span>}
                </div>
                <div
                  ref={reg('btn-send')}
                  style={{
                    height: 44, padding: '0 24px', borderRadius: R.lg, background: C.primary, color: C.primaryFg,
                    fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
                    transform: ui.sendPressed ? 'scale(0.95)' : 'scale(1)', opacity: ui.sendPressed ? 0.9 : 1,
                  }}
                >
                  <Ic d={P.send} s={16} />שלח הזמנה
                </div>
              </div>
            </Card>

            {/* pending invites (animates in) */}
            <div style={{ height: ui.pendingP * 164, opacity: ui.pendingP, overflow: 'hidden' }}>
              <Card id="card-pending" style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 16, textAlign: 'right', marginBottom: 12 }}>הזמנות ממתינות (1)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: R.lg - 6 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'hsla(42,72%,60%,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ic d={P.send} s={14} col={C.primary} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div dir="ltr" style={{ fontSize: 14, textAlign: 'right' }}>nir@gmail.com</div>
                    <div style={{ fontSize: 12, color: C.mutedFg, marginTop: 2, textAlign: 'right' }}>23.7.2026 · ממתין לאישור</div>
                  </div>
                  <div
                    ref={reg('btn-resend')}
                    style={{
                      height: 28, padding: '0 10px', borderRadius: R.md, display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 500, color: C.primary,
                      background: ui.resendHover ? 'hsla(42,72%,60%,0.1)' : 'transparent', flexShrink: 0,
                    }}
                  >
                    <Ic d={P.refresh} s={14} />שלח שוב
                  </div>
                  <IconBtn
                    id="btn-cancel-invite" d={P.trash} hover={ui.trashInvHover}
                    col={ui.trashInvHover ? C.destructive : C.mutedFg} hoverBg="hsla(350,89%,60%,0.1)"
                  />
                </div>
              </Card>
            </div>

            {/* members card */}
            <Card id="card-members">
              <div style={{ fontWeight: 600, fontSize: 16, textAlign: 'right', marginBottom: 12 }}>תלמידים בקהילה</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {MEMBERS.map((m, i) => {
                  const hover = i === 0 ? ui.rowHover0 : ui.rowHover1;
                  const editing = i === 0 && ui.nickEditing;
                  const shown = i === 0 && nick ? 'חנניה' : m.name;
                  return (
                    <div
                      key={i}
                      ref={reg('row-m' + i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16, padding: 12, borderRadius: R.lg - 6,
                        background: hover ? 'hsla(205,40%,12%,0.3)' : 'transparent',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', background: 'hsla(42,72%,60%,0.1)', color: C.primary,
                        fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{m.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              ref={reg('inp-nick')}
                              style={{
                                height: 28, width: 160, borderRadius: R.md - 6, background: C.surface,
                                border: '1px solid ' + C.border, padding: '0 8px', display: 'flex',
                                alignItems: 'center', fontSize: 14,
                              }}
                            >
                              {ui.nickText}<Caret on t={ui.t} h={14} />
                            </div>
                            <div ref={reg('btn-nick-save')} style={{
                              width: 24, height: 24, borderRadius: 4, background: 'hsla(42,72%,60%,0.1)', color: C.primary,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}><Ic d={P.check} s={14} /></div>
                            <div style={{
                              width: 24, height: 24, borderRadius: 4, color: C.mutedFg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}><Ic d={P.x} s={14} /></div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{shown}</span>
                            {i === 0 && nick && <span style={{ fontSize: 10, color: C.mutedFg }}>({m.name})</span>}
                            <div
                              ref={i === 0 ? reg('btn-pencil-0') : undefined}
                              style={{
                                width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: C.mutedFg, opacity: hover ? 1 : 0,
                              }}
                            >
                              <Ic d={P.pencil} s={12} />
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: C.mutedFg, textAlign: 'right' }} dir="ltr">{m.mail}</div>
                      </div>
                      <div style={{
                        fontSize: 12, color: C.mutedFg, background: C.muted, padding: '4px 8px',
                        borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
                      }}>{m.date}</div>
                      <IconBtn
                        id={'btn-shield-' + i} d={P.shield} size={32} icon={16}
                        col={(i === 0 && ui.shieldHover0) ? C.primary : 'hsla(42,72%,60%,0.6)'}
                        hover={i === 0 && ui.shieldHover0} hoverBg="hsla(42,72%,60%,0.1)"
                      />
                      <IconBtn
                        id={'btn-trash-' + i} d={P.trash}
                        hover={i === 1 && ui.trashHover1}
                        col={(i === 1 && ui.trashHover1) ? C.destructive : C.mutedFg} hoverBg="hsla(350,89%,60%,0.1)"
                        style={{ opacity: hover || (i === 1 && ui.trashHover1) ? 1 : 0 }}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </main>
      </div>

      {/* dim + permissions side panel */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', opacity: ui.panelP, pointerEvents: 'none' }} />
      <div
        ref={reg('panel')}
        style={{
          position: 'absolute', top: 0, left: 0, width: 400, height: STAGE_H, overflow: 'hidden',
          borderInlineStart: '1px solid ' + C.border, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
          transform: `translateX(${(1 - ui.panelP) * -110}%)`, boxSizing: 'border-box',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, backgroundColor: C.lgBg,
          backgroundImage: `linear-gradient(to bottom, ${C.lgHighlight}, transparent 32%)`,
          backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        }} />
        <div style={{ position: 'relative', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div
              ref={reg('btn-panel-close')}
              style={{
                width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: ui.closeHover ? C.fg : C.mutedFg,
              }}
            >
              <Ic d={P.x} s={20} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.022em' }}>הרשאות קטגוריות</div>
            <div style={{ width: 28 }} />
          </div>
          <div style={{ fontSize: 14, color: C.mutedFg, textAlign: 'center', marginBottom: 24 }}>
            בחר לאילו קטגוריות <span style={{ fontWeight: 600, color: C.fg }}>חנניה</span> יכול לגשת
          </div>
          <div style={{
            background: 'hsla(42,72%,60%,0.05)', border: '1px solid hsla(42,72%,60%,0.15)', borderRadius: R.xl,
            padding: 12, marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <Ic d={P.shield} s={16} col={C.primary} style={{ marginTop: 2 }} />
            <div style={{ fontSize: 12, color: C.mutedFg, lineHeight: 1.625, textAlign: 'right' }}>
              ללא הרשאות ספציפיות — התלמיד רואה את כל הקטגוריות הפומביות. הגדר כאן הרשאות להגבלת גישה לקטגוריות נבחרות בלבד.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CATS.map(([title, n], i) => {
              const granted = i === 0 ? ui.grant0 : i === 1 ? ui.grant1 : false;
              const btnHover = ui.grantHover === i;
              return (
                <div
                  key={i}
                  ref={reg('cat-' + i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.xl,
                    border: '1px solid ' + (granted ? 'hsla(42,72%,60%,0.3)' : C.border),
                    background: granted ? 'hsla(42,72%,60%,0.05)' : C.surface,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: R.lg - 6, background: granted ? 'hsla(42,72%,60%,0.1)' : C.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ic d={granted ? P.unlock : P.lock} s={16} col={granted ? C.primary : C.mutedFg} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: granted ? C.fg : C.mutedFg, textAlign: 'right' }}>{title}</div>
                    <div style={{ fontSize: 12, color: C.mutedFg, textAlign: 'right' }}>{n} שיעורים</div>
                  </div>
                  <div
                    ref={reg('btn-grant-' + i)}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: R.lg, fontSize: 12, fontWeight: 500,
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                      background: granted ? 'hsla(350,89%,60%,0.1)' : C.primary,
                      color: granted ? C.destructive : C.primaryFg,
                      opacity: btnHover ? 0.9 : 1,
                    }}
                  >{granted ? 'בטל גישה' : 'אשר גישה'}</div>
                </div>
              );
            })}
          </div>
          {(ui.grant0 || ui.grant1) && (
            <div
              ref={reg('panel-foot')}
              style={{
                marginTop: 16, paddingTop: 16, borderTop: '1px solid ' + C.border,
                fontSize: 12, color: C.mutedFg, textAlign: 'center',
              }}
            >
              <span style={{ fontWeight: 600, color: C.fg }}>{(ui.grant0 ? 1 : 0) + (ui.grant1 ? 1 : 0)}</span> קטגוריות עם גישה מוגדרת
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── scene machinery ──────────────────────────────────────────
   A scene is PLAIN DATA (a function of local time), not a component. The stage
   itself is rendered once by the player and just re-styled every frame, so
   crossing a scene boundary never unmounts anything — critical because the
   WebGL planet scene and the element registry both live inside the stage and
   rebuilding them per scene meant a black background and a camera pop at every
   cut. */
type SceneCfg = {
  stops: Stop[]; cam: CamStop[]; clicks: number[]; ui: UIState; overlay?: React.ReactNode;
};

/* One forced re-render after first layout so the element registry is populated
   before any position is read (frame 0 falls back to the stage centre). */
function useMeasured() {
  const [, s] = React.useState(0);
  React.useLayoutEffect(() => s(1), []);
}

/* ── choreography ─────────────────────────────────────────── */
const EMAIL = 'nir@gmail.com';
const INV_IN = T('inp-invite', [-60, 0]);
const CAM_INVITE: CamState = { z: 1.45, tg: T('card-invite', [0, 36]) };
const CAM_PENDING: CamState = { z: 1.55, tg: T('card-pending', [0, 10], 'card-invite') };
const CAM_ROW0: CamState = { z: 1.5, tg: T('row-m0', [0, 24]) };
const CAM_PANEL: CamState = { z: 1.35, tg: T('panel', [0, -20]) };
const CAM_ROW1: CamState = { z: 1.5, tg: T('row-m1', [0, 12]) };
const CAM_FULL: CamState = { z: 1, tg: [640, 360] };

const S1 = (t: number): SceneCfg => ({
  stops: [[0, [730, 250]], [1.0, [730, 250]], [2.5, INV_IN]],
  cam: [[0, CAM_FULL], [0.9, CAM_FULL], [2.5, CAM_INVITE]],
  clicks: [],
  ui: U({ t }),
});

const S2 = (t: number): SceneCfg => ({
  stops: [[0, INV_IN], [0.55, INV_IN], [3.9, INV_IN], [4.55, T('btn-send')], [6.5, T('btn-send')]],
  cam: [[0, CAM_INVITE], [4.2, CAM_INVITE], [6.5, CAM_PENDING]],
  clicks: [0.65, 4.75],
  ui: U({
    t,
    inputFocus: t > 0.7,
    email: EMAIL.slice(0, Math.floor(clamp01((t - 1.05) / 2.5) * EMAIL.length)),
    sendPressed: t > 4.75 && t < 5.05,
    pendingP: seg(t, 5.0, 5.8),
  }),
});

const S3 = (t: number): SceneCfg => ({
  stops: [
    [0, T('btn-send')], [1.0, T('btn-resend')], [2.4, T('btn-resend')],
    [3.0, T('btn-cancel-invite')], [3.9, T('btn-cancel-invite')], [4.5, T('btn-cancel-invite', [12, 46])],
  ],
  cam: [[0, CAM_PENDING], [4.5, { z: 1.58, tg: CAM_PENDING.tg }]],
  clicks: [],
  ui: U({ t, pendingP: 1, resendHover: t > 1.0 && t < 2.8, trashInvHover: t > 3.0 && t < 4.1 }),
});

const S4 = (t: number): SceneCfg => ({
  stops: [
    [0, T('btn-cancel-invite', [12, 46])], [1.05, T('btn-pencil-0')], [1.5, T('btn-pencil-0')],
    [2.1, T('inp-nick', [30, 26], 'btn-pencil-0')], [3.3, T('btn-nick-save', [0, 0], 'btn-pencil-0')],
    [4.0, T('btn-nick-save', [0, 0], 'btn-pencil-0')], [4.9, T('btn-shield-0')], [5.5, T('btn-shield-0')],
  ],
  cam: [[0, CAM_PENDING], [0.4, CAM_PENDING], [1.5, CAM_ROW0], [5.5, CAM_ROW0]],
  clicks: [1.5, 3.95],
  ui: U({
    t, pendingP: 1,
    rowHover0: t > 0.9,
    nickEditing: t > 1.58 && t < 4.02,
    nickText: 'חנניה'.slice(0, Math.floor(clamp01((t - 2.05) / 1.0) * 5)),
    nickApplied: t > 4.02,
  }),
});

const S5 = (t: number): SceneCfg => ({
  stops: [
    [0, T('btn-shield-0')], [0.55, T('btn-shield-0')], [1.75, T('btn-grant-0')], [2.45, T('btn-grant-0')],
    [3.3, T('btn-grant-1')], [4.05, T('btn-grant-1')],
    [5.4, T('panel-foot', [0, 0], 'cat-2')], [6.5, T('panel-foot', [0, 0], 'cat-2')],
  ],
  cam: [[0, CAM_ROW0], [0.7, CAM_ROW0], [1.9, CAM_PANEL], [6.5, CAM_PANEL]],
  clicks: [0.5, 2.4, 4.0],
  ui: U({
    t, pendingP: 1, nickApplied: true,
    rowHover0: t < 0.8, shieldHover0: t < 0.55,
    panelP: seg(t, 0.55, 1.25),
    grantHover: (t > 1.9 && t < 2.45) ? 0 : (t > 3.45 && t < 4.05) ? 1 : null,
    grant0: t > 2.45, grant1: t > 4.05,
  }),
});

const S6 = (t: number): SceneCfg => ({
  stops: [
    [0, T('panel-foot', [0, 0], 'cat-2')], [0.5, T('btn-panel-close')], [0.9, T('btn-panel-close')],
    [1.9, T('btn-trash-1')], [2.5, T('btn-trash-1')],
  ],
  cam: [[0, CAM_PANEL], [0.9, CAM_PANEL], [2.0, CAM_ROW1], [2.5, CAM_ROW1]],
  clicks: [0.85],
  ui: U({
    t, pendingP: 1, nickApplied: true, grant0: true, grant1: true,
    closeHover: t > 0.5 && t < 1.0,
    panelP: 1 - seg(t, 0.95, 1.55),
    rowHover1: t > 1.9, trashHover1: t > 2.05,
  }),
});

const S7 = (t: number): SceneCfg => {
  const op = seg(t, 0.7, 1.4);
  return {
    stops: [[0, T('btn-trash-1')], [0.4, T('btn-trash-1')], [1.4, [660, 480]], [2, [660, 480]]] as Stop[],
    cam: [[0, CAM_ROW1], [0.3, CAM_ROW1], [1.5, CAM_FULL], [2, CAM_FULL]] as CamStop[],
    clicks: [],
    ui: U({ t, pendingP: 1, nickApplied: true, grant0: true, grant1: true, rowHover1: t < 0.4, trashHover1: t < 0.35 }),
    overlay: (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `rgba(3,4,12,${0.6 * op})`, zIndex: 70,
      }}>
        <div dir="rtl" style={{
          opacity: op, transform: `scale(${0.92 + 0.08 * op})`, textAlign: 'center',
          backgroundColor: 'hsla(200,42%,13%,0.95)',
          backgroundImage: `linear-gradient(to bottom, ${C.lgHighlight}, transparent 30%)`,
          border: '1px solid hsla(42,72%,60%,0.3)', borderRadius: R.x2, padding: '40px 70px',
          boxShadow: '0 20px 70px rgba(0,0,0,0.6)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: R.lg, background: C.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
          }}>
            <Ic d={P.cap} s={28} col={C.primaryFg} sw={2} />
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: C.fg, letterSpacing: '-0.022em' }}>זהו! טאב תלמידים</div>
          <div style={{ fontSize: 15, color: C.mutedFg, marginTop: 8 }}>הזמנות · כינויים · הרשאות · הכל במקום אחד</div>
          <div style={{ fontSize: 13, color: C.primary, marginTop: 16, fontWeight: 600 }}>Caesar 0 DTE</div>
        </div>
      </div>
    ),
  };
};

const SCENES: { name: string; dur: number; text?: string; cfg: (t: number) => SceneCfg }[] = [
  { name: 'פתיחה', dur: 2.5, text: 'טאב תלמידים — סיור מהיר בכל הפונקציות', cfg: S1 },
  { name: 'הזמנת תלמיד', dur: 6.5, text: 'מזמינים תלמיד: מקלידים אימייל ולוחצים ״שלח הזמנה״', cfg: S2 },
  { name: 'הזמנות ממתינות', dur: 4.5, text: 'ההזמנה ממתינה — ״שלח שוב״ אם המייל לא הגיע, או ביטול בפח', cfg: S3 },
  { name: 'עריכת כינוי', dur: 5.5, text: 'עיפרון ליד השם — נותנים לתלמיד כינוי', cfg: S4 },
  { name: 'הרשאות קטגוריות', dur: 6.5, text: 'המגן פותח הרשאות — בוחרים אילו קטגוריות התלמיד רואה', cfg: S5 },
  { name: 'הסרת תלמיד', dur: 2.5, text: 'הפח מסיר את התלמיד מהקהילה', cfg: S6 },
  { name: 'סיום', dur: 2, cfg: S7 },
];
const STARTS = SCENES.reduce<number[]>((acc, s, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].dur); return acc; }, []);
const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);

/* ── player ───────────────────────────────────────────────── */
function Player({ onClose }: { onClose: () => void }) {
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [scale, setScale] = React.useState(0.5);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const headRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // One canvas, every resolution. The stage is a fixed 1280×720 composition
  // scaled to the largest size that still fits BOTH the available width and the
  // height left after the header and the controls — so it letterboxes like a
  // video player instead of ever being cropped, from a 375px phone to an
  // ultrawide. Everything it depends on (dialog width, chrome height, viewport
  // height, dialog padding) is measured rather than assumed, so chips wrapping
  // onto a second line or a different breakpoint's padding can't break the fit.
  React.useLayoutEffect(() => {
    const root = rootRef.current, head = headRef.current, bottom = bottomRef.current;
    if (!root || !head || !bottom) return;
    const fit = () => {
      const gap = parseFloat(getComputedStyle(root).rowGap) || 0;
      const dialog = root.parentElement;
      const pad = dialog
        ? parseFloat(getComputedStyle(dialog).paddingTop) + parseFloat(getComputedStyle(dialog).paddingBottom)
        : 0;
      // matches the dialog's own max-h-[calc(100dvh-1rem)], minus 2px of slack
      const availH = window.innerHeight - 16 - 2 - pad - head.offsetHeight - bottom.offsetHeight - gap * 2;
      const availW = root.clientWidth;
      setScale(Math.max(Math.min(availW / STAGE_W, availH / STAGE_H), 0.08));
    };
    fit();
    // Reads only width + chrome heights, never the stage's own size, so a
    // resize triggered by the new stage size resolves to the same scale.
    const ro = new ResizeObserver(fit);
    ro.observe(root); ro.observe(head); ro.observe(bottom);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  // rAF timeline. Loops, exactly like the source composition's playback mode.
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      setTime((t) => (t + dt) % TOTAL);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const idx = React.useMemo(() => {
    let i = SCENES.length - 1;
    while (i > 0 && time < STARTS[i]) i--;
    return i;
  }, [time]);
  const scene = SCENES[idx];
  const local = time - STARTS[idx];

  useMeasured();
  const cfg = scene.cfg(local);
  const cursor = cursorAt(local, cfg.stops);
  const cam = camAt(local, cfg.cam);

  const seekScene = React.useCallback((i: number) => {
    const n = Math.min(Math.max(i, 0), SCENES.length - 1);
    setTime(STARTS[n]);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekScene(idx + 1); }   // RTL: left = forward
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekScene(idx - 1); }
  };

  return (
    <div ref={rootRef} dir="rtl" className="outline-none flex flex-col gap-2 sm:gap-3" tabIndex={0} onKeyDown={onKey}>
      <div ref={headRef} className="shrink-0 flex items-center gap-2 pl-8">
        <GraduationIcon className="w-5 h-5 text-primary shrink-0" />
        <DialogTitle className="text-sm sm:text-base font-bold text-foreground">מדריך טאב תלמידים</DialogTitle>
        <span className="text-xs text-muted-foreground">· {Math.round(TOTAL)} שניות</span>
      </div>

      {/* stage — sized to the computed scale and centred; the dialog hugs it */}
      <div className="shrink-0 w-full flex items-center justify-center">
        <div
          className="relative overflow-hidden rounded-xl border border-border/60 bg-[#03040c] cursor-pointer"
          style={{ width: STAGE_W * scale, height: STAGE_H * scale }}
          onClick={() => setPlaying((p) => !p)}
        >
          {/* fit layer → camera layer → the one and only stage */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: STAGE_W, height: STAGE_H,
            transform: `scale(${scale})`, transformOrigin: 'top right',
            background: C.bg, fontFamily: FONT, overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: STAGE_W, height: STAGE_H,
              transform: `translate(${640 - cam.cx * cam.z}px, ${360 - cam.cy * cam.z}px) scale(${cam.z})`,
              transformOrigin: '0 0',
            }}>
              <StudentsTabUI ui={cfg.ui} />
              <Ripples t={local} clicks={cfg.clicks} stops={cfg.stops} />
              <Cursor x={cursor.x} y={cursor.y} press={pressAt(local, cfg.clicks)} />
            </div>
            {cfg.overlay || null}
            <Caption text={scene.text} step={idx + 1} p={local / scene.dur} />
          </div>
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center">
                <PlayIcon solid className="w-7 h-7 text-primary-foreground rotate-180" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* controls + steps + footer, measured as one block */}
      <div ref={bottomRef} className="shrink-0 flex flex-col gap-2 sm:gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="w-9 h-9 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
          title={playing ? 'השהה' : 'נגן'}
        >
          {playing ? <PauseIcon solid className="w-4 h-4" /> : <PlayIcon className="w-4 h-4 rotate-180" />}
        </button>
        <button
          type="button"
          onClick={() => { setTime(0); setPlaying(true); }}
          className="w-9 h-9 shrink-0 rounded-lg bg-surface ring-1 ring-border text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
          title="התחל מחדש"
        >
          <ResetIcon className="w-4 h-4" />
        </button>

        {/* per-scene progress track — click a segment to jump to that step */}
        <div className="flex-1 flex gap-1">
          {SCENES.map((s, i) => {
            const fill = i < idx ? 1 : i > idx ? 0 : clamp01(local / s.dur);
            return (
              <button
                key={i}
                type="button"
                onClick={() => seekScene(i)}
                title={s.name}
                className="group relative h-2 rounded-full bg-muted overflow-hidden transition-all"
                style={{ flexGrow: s.dur }}
              >
                <span
                  className="absolute inset-y-0 right-0 bg-primary rounded-full"
                  style={{ width: `${fill * 100}%` }}
                />
              </button>
            );
          })}
        </div>

        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 text-center">
          {Math.floor(time)}s / {Math.round(TOTAL)}s
        </span>
      </div>

      {/* step chips */}
      <div className="flex flex-wrap gap-1.5">
        {SCENES.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => seekScene(i)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              i === idx
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {i + 1}. {s.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          רווח = נגן/השהה · חיצים = מעבר בין שלבים
        </p>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-4 rounded-lg bg-surface ring-1 ring-border text-sm text-foreground hover:bg-muted/40 transition-colors"
        >
          סגור
        </button>
      </div>
      </div>
    </div>
  );
}

/* ── public API ───────────────────────────────────────────── */
export default function StudentsTabTutorial({ open, onOpenChange }: {
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Viewport-sized shell: the player is a flex column inside it, so the
          stage gets exactly the space left over at any resolution. dvh (not vh)
          keeps mobile browser chrome from cropping the bottom controls. */}
      <DialogContent
        aria-describedby={undefined}
        className="block overflow-hidden p-3 sm:p-4 md:p-5
                   w-[calc(100vw-1rem)] max-w-[1500px]
                   h-auto max-h-[calc(100dvh-1rem)]"
      >
        <Player onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

