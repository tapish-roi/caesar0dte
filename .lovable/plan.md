

## Cinematic 3D Moon — Top-Left Background Accent

Add a real, slowly self-rotating 3D moon to the top-left of the dashboard background. Not a PNG, not flat — a properly lit sphere with surface detail, soft rim light, and a subtle glow halo. It sits behind the UI as part of the existing space ambience, never competing with content.

### Visual direction

- **Position**: Top-left, partially bleeding off the corner so only ~70% of the moon is visible. Feels like a celestial body framing the scene, not a logo.
- **Size**: ~340px on desktop, ~180px on mobile. Large enough to feel cinematic, small enough to stay an accent.
- **Look**: Cratered lunar surface (real normal/displacement map), warm off-white tone (#E8E4D8) lit from the lower-right by a soft directional light. Dark side falls into deep blue shadow — blends with the space background. Subtle outer glow halo (very low opacity, large blur).
- **Motion**: Slow self-rotation on its Y axis, ~60 seconds per full turn. Calm, hypnotic, never distracting. Plus a barely-perceptible vertical float (±4px over 12s).
- **Integration**: Sits behind UI (`z-index: 1`), above the existing star layers but below all content. Pointer-events disabled. Honors `prefers-reduced-motion` (rotation freezes, float stops).

### Technical approach

Use **React Three Fiber** (`@react-three/fiber@^8.18` + `@react-three/drei@^9.122.0` + `three@^0.160`) — the proper tool for a real 3D sphere with PBR lighting. A CSS-only fake would look flat exactly like the user wants to avoid.

- New component `src/components/CinematicMoon.tsx`:
  - `<Canvas>` with transparent background, fixed positioned top-left, sized responsively.
  - `<Sphere>` with `MeshStandardMaterial` using a high-quality lunar texture set (color + normal map) loaded via `useTexture` from a public CDN (NASA-derived, freely licensed).
  - One `directionalLight` (warm, intensity ~1.2, positioned lower-right) + one very low `ambientLight` (cool blue ~0.15) for shadow tone.
  - `useFrame` rotates the mesh on Y; subtle group-level Y position sine wave for float.
  - Outer glow done with a second slightly larger sphere using `MeshBasicMaterial` + back-side rendering + low opacity, OR a CSS radial-gradient div behind the canvas (lighter on perf — preferred).
- **Performance guard**: `dpr={[1, 1.5]}`, `frameloop="always"` only when visible (use `IntersectionObserver` or just rely on it being always on screen at top-left). Single mesh, no postprocessing — cheap.
- **Reduced motion**: Skip `useFrame` rotation update when `prefers-reduced-motion: reduce`.
- **Failsafe**: Wrap the Canvas in a `<Suspense fallback={null}>` and an error boundary so any WebGL/texture failure silently hides the moon — background remains exactly as today.

### Mounting

Mount once inside `src/components/SpaceBackground.tsx` (alongside the existing star layers) so it appears on every page that already uses the space background — no routing or layout changes.

### What will NOT change

- No edits to login logic, routing, auth, layout, sidebar, cards, or existing star/shooting-star animations.
- No new colors introduced into the palette — moon tones blend with the existing dark-blue space wash.
- Existing `SpaceBackground` star layers remain untouched; the moon is added as a new sibling layer.

### Files

- **New**: `src/components/CinematicMoon.tsx`
- **Edit**: `src/components/SpaceBackground.tsx` (mount `<CinematicMoon />` as one extra layer)
- **Edit**: `package.json` (add `three`, `@react-three/fiber@^8.18`, `@react-three/drei@^9.122.0` at the exact pinned versions required by the React 18 stack)

### Expected result

A quietly rotating, properly-lit lunar sphere anchors the top-left corner of every dashboard view — depth, atmosphere, and a clear "this is a premium product" signal. Never flashy, never in the way.

