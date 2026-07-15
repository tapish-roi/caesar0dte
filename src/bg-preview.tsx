// Dev-only entry for bg-preview.html — renders the planet background standalone
// with switcher buttons. Not part of the production build.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlanetBackground, { type Planet } from '@/components/PlanetBackground';
import './index.css';

const PLANETS: Planet[] = ['earth', 'moon', 'mars', 'jupiter', 'saturn', 'neptune', 'hd'];

function Preview() {
  const [planet, setPlanet] = useState<Planet>('earth');
  return (
    <div style={{ minHeight: '100vh' }}>
      <PlanetBackground activePlanet={planet} />
      <div style={{ position: 'fixed', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        {PLANETS.map((p) => (
          <button
            key={p}
            onClick={() => setPlanet(p)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.25)',
              background: planet === p ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.45)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
