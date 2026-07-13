# Planet textures for the three.js background

`PlanetBackground` (src/components/planet-background/scene.ts) loads these
textures. They **ship with the project** (public-domain NASA-derived maps), so
the background is photoreal out of the box. Replace a file with a higher-res
version of the same name to upgrade it — no code changes needed.

## Files in use

| File               | Used by | Source                                             |
| ------------------ | ------- | -------------------------------------------------- |
| `earth_day.jpg`    | Earth   | Blue Marble day map                                |
| `earth_night.jpg`  | Earth   | Black Marble city-lights (shown on the night edge) |
| `earth_water.png`  | Earth   | Ocean mask (drives the sun-glint specular)         |
| `earth_clouds.png` | Earth   | Cloud layer (separate slowly-rotating shell)       |
| `night_sky.png`    | backdrop| Deep-star sky sphere                               |
| `moon.jpg`         | Moon    | Lunar surface (maria/highland tone map)            |
| `mars.jpg`         | Mars    | Mars surface albedo                                |
| `mars_bump.jpg`    | Mars    | Mars elevation/bump map (relief shading)           |
| `jupiter.jpg`      | Jupiter | Jupiter cloud bands                                |
| `saturn.jpg`       | Saturn  | Saturn cloud bands                                 |
| `neptune.jpg`      | Neptune | Neptune source map (recolored to methane azure)    |

All equirectangular (2:1). Current set is 2K — plenty for a background. The
Milky Way band, star glints, and **Saturn's entire ring system** are procedural
shaders, not textures (no ring image needed).

## Upgrading

Higher-res maps: Solar System Scope (https://www.solarsystemscope.com/textures/,
CC BY 4.0) or NASA Visible Earth (https://visibleearth.nasa.gov). Keep the exact
filenames above.

## Preview without logging in

`http://localhost:8080/bg-preview.html` on the dev server — planet-switcher
buttons, no account needed. (Excluded from production builds.)
