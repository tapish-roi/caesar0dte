# Background planet video assets

`VideoBackground.tsx` loads pre-rendered looping video from this folder. The
component degrades gracefully — `<video>` → poster `.jpg` → CSS deep-space
gradient — so the app looks fine before any of these files exist. Add the media
here whenever it's ready; no code changes needed.

## Files expected (one set per planet)

For each of: `earth`, `moon`, `mars`, `saturn`, `jupiter`

| File            | Purpose                          | Required |
| --------------- | -------------------------------- | -------- |
| `<planet>.webm` | Primary loop (VP9 or AV1)        | strong yes |
| `<planet>.mp4`  | Fallback loop (H.264) for Safari | yes |
| `<planet>.jpg`  | Poster: first frame; shown while loading, on reduced-motion, and on any video error | yes |

Example: `earth.webm`, `earth.mp4`, `earth.jpg`.

## Target specs (per clip)

- **Resolution:** 1920×1080 (1080p). Don't ship 4K — it bloats the file for a
  background that sits behind UI. The layer uses `object-fit: cover`.
- **Length:** 12–20s, **seamlessly looping** (last frame flows into the first).
- **Frame rate:** 30fps is plenty for slow orbital motion.
- **Motion:** keep it slow and subtle (gentle rotation / drift). Slow motion
  compresses far smaller and looks more premium than fast movement.
- **No audio track** — strip it; the component mutes anyway and audio wastes bytes.
- **File size budget:** aim for **2–4 MB** per `.webm`, ~4–6 MB per `.mp4`.

## Producing the clips

Pick whichever fits your pipeline:

1. **Screen-record your existing Spline scene** (keeps the exact current look).
   Capture each planet full-screen at 1080p, ~15s, then encode (below). This is
   the zero-cost path that preserves your art.
2. **NASA public-domain footage** — the NASA Scientific Visualization Studio and
   image galleries have real, license-free planet/earth footage.
3. **Blender / commissioned render** — highest quality, most effort.

## Encoding (ffmpeg)

Assuming a source `earth_src.mp4`:

```sh
# WebM (VP9) — primary. CRF ~33 is a good size/quality balance for a backdrop.
ffmpeg -i earth_src.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 33 \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" \
  earth.webm

# MP4 (H.264) — Safari/iOS fallback. -movflags +faststart for quick start.
ffmpeg -i earth_src.mp4 -an -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -movflags +faststart \
  -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30" \
  earth.mp4

# Poster — grab the first frame.
ffmpeg -i earth.mp4 -frames:v 1 -q:v 3 earth.jpg
```

For a truly seamless loop, either author the source to loop, or mirror it:
`-vf "...,tblend,..."` approaches vary — simplest is to render the source with
matching start/end camera positions.

Repeat for `moon`, `mars`, `saturn`, `jupiter`.
