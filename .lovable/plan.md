
## Root Cause

There are **two bugs** that together cause drawings to move when a user resizes their window:

**Bug 1 — Strokes denormalized too early on receive**

`stroke_add` handler (line 696-710) immediately converts normalized [0,1] coords to canvas pixels (`p.x * w, p.y * h`) and stores pixel coords in `strokesRef`. When the window resizes, `syncSize` runs and **changes `canvas.width/height`**, but the already-stored strokes still hold the old pixel values — so they render at wrong positions on the resized canvas.

**Bug 2 — Local strokes stored in pixel form**

`broadcastStroke` (line 968) normalizes coords for the broadcast but stores the **original pixel-coord stroke** locally in `strokesRef`. If the canvas resizes, the same mismatch happens.

## The Fix — Keep All Strokes in Normalized [0,1] Form

The simplest and most robust fix: **always store strokes in normalized [0,1] coords**. Scale to pixels only at render time (`renderCanvas`/`renderStrokesOnCtx`).

### Change 1 — `stroke_add` handler: store normalized, don't denormalize (line 696-710)

```typescript
// Store stroke exactly as received (already normalized [0,1])
strokesRef.current = [...strokesRef.current, raw];
setStrokes(s => [...s, raw]);
```

### Change 2 — `broadcastStroke`: store normalized locally too (line 968-980)

Currently stores the pixel-coord original locally. Instead, store the normalized version:

```typescript
const normalized = { ...stroke, points: stroke.points.map(normalizePoint), ... };
strokesRef.current = [...strokesRef.current, normalized]; // normalized, not stroke
setStrokes(s => [...s, normalized]);
```

### Change 3 — `renderCanvas`: scale points at draw time (line 760-831)

`renderCanvas` currently calls `renderStrokesOnCtx(ctx, canvas.width, canvas.height, stks)` and `renderStrokesOnCtx` already multiplies text coords by `w,h`. But the **points** (`moveTo/lineTo`) are passed raw — it expects them already in pixels.

The fix: in `renderStrokesOnCtx`, scale all point coords by `w,h` before drawing:

```typescript
// In renderStrokesOnCtx, before drawing paths:
const px = (pt: DrawPoint) => ({ x: pt.x * w, y: pt.y * h });

// Then:
ctx.moveTo(px(stroke.points[0]).x, px(stroke.points[0]).y);
stroke.points.slice(1).forEach(p => ctx.lineTo(px(p).x, px(p).y));
```

And for arc (single point dot):
```typescript
ctx.arc(px(stroke.points[0]).x, px(stroke.points[0]).y, stroke.size / 2, 0, Math.PI * 2);
```

### Change 4 — `handleCanvasMouseDown` / text input: normalize `textPos`

`textPos` is stored in pixel coords and used in the text stroke. After change 2, `textX/textY` are stored normalized. So when creating the text stroke, normalize `textPos` using `normalizePoint` before storing in `textX/textY`.

## Files to Change

Only `src/components/LiveRoom.tsx`:

- **Lines 634-688** (`renderStrokesOnCtx`): add `const px = (p: DrawPoint) => ({ x: p.x * w, y: p.y * h })` and use `px(...)` for all point coordinates
- **Lines 696-710** (`stroke_add` handler): remove denormalization — store `raw` directly
- **Lines 968-980** (`broadcastStroke`): store `normalized` locally instead of original `stroke`
- **Lines 1040-1055** (`handleTextConfirm`): normalize `textPos` before setting `textX/textY` in the stroke

## Why This Permanently Fixes the Problem

All strokes are now stored as [0,1] normalized values. `renderCanvas` converts to pixels on every frame using the current canvas size. When the window resizes, `syncSize` updates `canvas.width/height` — the next `renderCanvas` call automatically renders everything in the correct positions for the new size. No stale pixel coordinates anywhere.
