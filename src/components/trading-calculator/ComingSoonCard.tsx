// ──────────────────────────────────────────────────────────────────────────────
// ComingSoonCard — animated "orbit" placeholder shown while the מחשבון מסחר
// section is being rebuilt. Ported from the "Coming Soon Card 1b" design
// (Website card redesign project) and rebuilt on the project's Liquid Glass
// surface (the shared <Card>) so it matches the other cards: frosted blur,
// refractive border, cursor-tracked specular sheen and hover lift.
// ──────────────────────────────────────────────────────────────────────────────

import { Card } from '@/components/ui/card';

const STAR = (left: string, top: string, size: number, dur: string, delay: string) => ({
  position: 'absolute' as const,
  left,
  top,
  width: size,
  height: size,
  borderRadius: '50%',
  background: '#fff',
  animation: `ccTwinkle ${dur} ease-in-out ${delay} infinite`,
});

export default function ComingSoonCard() {
  return (
    <Card
      dir="rtl"
      className="cc-glass relative flex min-h-[440px] flex-col items-center justify-center gap-[30px] overflow-hidden"
      style={{
        backgroundColor: 'hsla(200, 42%, 13%, 0.42)',
        borderColor: 'hsla(195, 45%, 60%, 0.10)',
      }}
    >
      <style>{`
        /* Disable the cursor-tracked specular sheen for this card only */
        .cc-glass::before{display:none!important}
        @keyframes ccTwinkle{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:.9;transform:scale(1.15)}}
        @keyframes ccPulse{0%,100%{opacity:.35;transform:scale(1)}50%{opacity:.75;transform:scale(1.12)}}
        @keyframes ccOrbit{to{transform:rotate(360deg)}}
        @keyframes ccScan{0%{transform:translateX(-160%)}100%{transform:translateX(160%)}}
      `}</style>

      {/* soft radial glow inside the glass — kept translucent so the frost reads */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 70% 25%, rgba(227,179,65,.10) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      {/* twinkling stars */}
      <div style={STAR('16%', '22%', 2, '3.4s', '0s')} />
      <div style={STAR('84%', '66%', 2, '4.2s', '1.1s')} />
      <div style={STAR('70%', '14%', 1.5, '2.9s', '.6s')} />
      <div style={STAR('28%', '80%', 2, '3.8s', '1.8s')} />
      <div style={STAR('44%', '10%', 1.5, '4.6s', '2s')} />
      <div style={STAR('8%', '52%', 2, '3.1s', '.3s')} />
      <div style={STAR('92%', '38%', 1.5, '3.9s', '1.5s')} />

      {/* orbit assembly */}
      <div
        style={{
          position: 'relative',
          width: 210,
          height: 210,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* glow pulse */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(227,179,65,.22) 0%, rgba(227,179,65,0) 62%)',
            animation: 'ccPulse 3.6s ease-in-out infinite',
          }}
        />
        {/* outer ring + spark */}
        <div
          style={{
            position: 'absolute',
            inset: 6,
            borderRadius: '50%',
            border: '1px solid rgba(227,179,65,.22)',
            animation: 'ccOrbit 9s linear infinite',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: -3,
              width: 6,
              height: 6,
              marginLeft: -3,
              borderRadius: '50%',
              background: '#f0cc70',
              boxShadow: '0 0 12px 3px rgba(240,204,112,.7)',
            }}
          />
        </div>
        {/* inner ring + spark, reverse */}
        <div
          style={{
            position: 'absolute',
            inset: 38,
            borderRadius: '50%',
            border: '1px dashed rgba(227,179,65,.28)',
            animation: 'ccOrbit 6s linear infinite reverse',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -2.5,
              width: 5,
              height: 5,
              marginLeft: -2.5,
              borderRadius: '50%',
              background: '#e3b341',
              boxShadow: '0 0 10px 2px rgba(227,179,65,.7)',
            }}
          />
        </div>
        {/* core */}
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: '50%',
            background:
              'linear-gradient(160deg, rgba(227,179,65,.22), rgba(227,179,65,.06))',
            border: '1px solid rgba(227,179,65,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow:
              '0 0 40px rgba(227,179,65,.3), inset 0 0 22px rgba(227,179,65,.14)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f0cc70"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        </div>
      </div>

      {/* title + scan line */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: '#f4f5f7',
            letterSpacing: '.5px',
            textShadow: '0 0 30px rgba(227,179,65,.25)',
          }}
        >
          בקרוב...
        </div>
        <div
          style={{
            width: 64,
            height: 2,
            borderRadius: 2,
            background:
              'linear-gradient(90deg, rgba(227,179,65,0), #e3b341, rgba(227,179,65,0))',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)',
              animation: 'ccScan 2.2s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </Card>
  );
}
