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
| `night_sky.png`    | backdrop| Deep-star sky sphere, 4096×2048 (mobile / fallback) |
| `starfield-8k.png` | backdrop| Deep-star sky sphere, 8192×4096 (desktop) — optional |
| `moon.jpg`         | Moon    | Lunar surface (maria/highland tone map)            |
| `mars.jpg`         | Mars    | Mars surface albedo                                |
| `mars_bump.jpg`    | Mars    | Mars elevation/bump map (relief shading)           |
| `jupiter.jpg`      | Jupiter | Jupiter cloud bands                                |
| `saturn.jpg`       | Saturn  | Saturn cloud bands                                 |
| `neptune.jpg`      | Neptune | Neptune source map (recolored to methane azure)    |

All equirectangular (2:1). The Milky Way band, star glints, **Saturn's entire
ring system**, and **all of HD 189733 b** are procedural shaders, not textures
(no ring image and no HD surface map needed).

## The 8K backdrop

The starfield wraps an 80-unit sphere, so at 4K individual stars smear on a large
display. `starfield-8k.png` fixes that, but it costs ~134 MB of VRAM decompressed
(4× the 4K) plus a multi-MB download — too much to force on a phone. So the scene
picks per device: the 8K only where there's headroom (not low-core, not a coarse
pointer, `maxTextureSize >= 8192`, viewport ≥ 1024px), the 4K everywhere else.

`starfield-8k.png` is **optional**. If it's absent, the loader logs a warning and
falls back to `night_sky.png` — the sky still renders, just at 4K. Drop the file
in to enable the 8K path; no code change needed.

## Upgrading

Higher-res maps: Solar System Scope (https://www.solarsystemscope.com/textures/,
CC BY 4.0) or NASA Visible Earth (https://visibleearth.nasa.gov). Keep the exact
filenames above.

## Preview without logging in

`http://localhost:8080/bg-preview.html` on the dev server — planet-switcher
buttons, no account needed. (Excluded from production builds.)
