

## Fix the invisible moon

The 3D moon component is mounting, but the lunar texture (hosted on Wikimedia) is being blocked by cross-origin restrictions. When the texture fails to load, Suspense throws, the error boundary catches it, and the component silently renders nothing — leaving only the soft CSS halo you currently see top-left.

### What I'll change

**Edit `src/components/CinematicMoon.tsx`** — two targeted changes, nothing else:

1. **Swap texture sources to CORS-safe URLs**
   - Color map: `https://threejs.org/examples/textures/planets/moon_1024.jpg` (the canonical three.js moon texture, served with proper CORS headers — same domain three.js's own docs use).
   - Bump map: same texture reused as a grayscale bump source (it's already grayscale-friendly).
   - Set `texture.crossOrigin = 'anonymous'` defensively.

2. **Procedural fallback so the moon is never invisible**
   - Wrap `useTexture` in a try/load-state check. If the texture fails, render the same sphere with a plain `meshStandardMaterial` (warm `#E8E4D8` color, no map, slight roughness variation) instead of returning `null` from the error boundary. The moon still appears — lit, rotating, with surface shading from the lights — even if the CDN is unreachable.
   - The error boundary stays as a last-resort safety net for catastrophic WebGL failure.

### What stays the same

- Position, size, lighting, rotation, float, halo, reduced-motion handling, z-index, pointer-events — all unchanged.
- `SpaceBackground.tsx`, `package.json`, and every other file — untouched.
- No new dependencies.

### Expected result

The cratered, slowly self-rotating lunar sphere appears top-left exactly as planned. If the texture CDN is ever down, you still get a properly-shaded warm-grey moon instead of just a glow.

