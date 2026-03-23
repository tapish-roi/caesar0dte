
## The Real Coordinate Mismatch Problem

The drawing canvas is `absolute inset-0 w-full h-full` — it covers the **full container** including black letterbox bars from `object-contain`. But the screen content (video/remote canvas) only occupies a centered sub-rectangle inside that container.

Example:
- User A: container 1400×900, video 16:9 → content fills 1400×787, with 56.5px black bars top and bottom
- User B: container 1000×700, video 16:9 → content fills 1000×562, with 69px bars top and bottom

When User A draws at canvas pixel `(100, 100)`:
- Normalized: `(100/1400, 100/900)` = `(0.071, 0.111)`
- On User B: `(0.071 × 1000, 0.111 × 700)` = `(71, 78)` — but this is inside the black bar area on User B, not in the same relative spot on the video

**The fix: size the canvas to exactly match the content rectangle, not the full container.**

## Solution

### Change 1 — `syncSize` calculates the actual content rect

Instead of using `el.offsetWidth / offsetHeight` (the container size), compute the actual video content bounding box using the video's intrinsic aspect ratio:

```typescript
const syncSize = () => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const container = canvas.parentElement;
  if (!container) return;
  
  // Get intrinsic aspect ratio from the source
  let intrinsicW: number, intrinsicH: number;
  if (screenSharing && screenVideoRef.current) {
    intrinsicW = screenVideoRef.current.videoWidth || 16;
    intrinsicH = screenVideoRef.current.videoHeight || 9;
  } else if (remoteScreenCanvasRef.current) {
    intrinsicW = remoteScreenCanvasRef.current.width || 16;
    intrinsicH = remoteScreenCanvasRef.current.height || 9;
  } else return;
  
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;
  const scale = Math.min(containerW / intrinsicW, containerH / intrinsicH);
  const contentW = intrinsicW * scale;
  const contentH = intrinsicH * scale;
  const offsetX = (containerW - contentW) / 2;
  const offsetY = (containerH - contentH) / 2;
  
  // Set canvas dimensions to content area only
  canvas.width = Math.round(contentW);
  canvas.height = Math.round(contentH);
  canvas.style.width = `${contentW}px`;
  canvas.style.height = `${contentH}px`;
  canvas.style.left = `${offsetX}px`;
  canvas.style.top = `${offsetY}px`;
  canvas.style.position = 'absolute';
  canvas.style.inset = 'unset'; // override inset-0
  renderCanvas();
};
```

### Change 2 — Same for the remote canvas (`remoteScreenCanvasRef`)

The remote canvas receives frames that are `w × h` pixels (e.g. 960×540). Its CSS should also be sized to match the container's content rect. When `screen_frame` is received and drawn:
- Read the image's natural aspect ratio from `img.naturalWidth / naturalHeight`
- Compute content rect in the container
- Set canvas CSS `width/height/left/top` the same way as above

Add a helper `syncRemoteCanvasLayout(imgW: number, imgH: number)` that is called after each frame draw, and also on container resize via `ResizeObserver`.

### Change 3 — Remote cursor positioning

Cursors currently use `left: cursor.x * 100%` of the container div. After this fix, cursors should be positioned relative to the canvas element itself (which now sits at the right offset). Since cursors are placed as siblings to the canvas inside the same container, position them relative to the canvas's offset:

```tsx
style={{ 
  left: `${offsetX + cursor.x * canvasW}px`, 
  top: `${offsetY + cursor.y * canvasH}px`,
  transform: 'translate(4px, 4px)' 
}}
```

This requires storing `contentRect` in state: `{ x, y, w, h }` updated by `syncSize`.

### Change 4 — Text input overlay

`textPos` coordinates are canvas-relative pixels. The text input overlay is also positioned inside the container, so it needs the same `+ offsetX / + offsetY` correction:

```tsx
style={{ left: textPos.x + contentRect.x, top: textPos.y + contentRect.y - fontSize }}
```

## Files to Change

Only `src/components/LiveRoom.tsx`:

- **Line 853-877** (`syncSize` useEffect): Replace with the content-rect calculation above. Add `contentRect` state (`{ x: number; y: number; w: number; h: number }`).
- **Line 1494-1503** (drawing canvas JSX): Remove `inset-0 w-full h-full` — canvas is now positioned absolutely by `syncSize`.
- **Line 1506-1521** (remote cursors JSX): Use `contentRect.x + cursor.x * contentRect.w` and `contentRect.y + cursor.y * contentRect.h`.
- **Line 1524-1537** (text input overlay): Add `contentRect.x` and `contentRect.y` offset to `textPos`.
- **Receive frame handler** (~line 510-540): After drawing the image to the remote canvas, call `syncRemoteCanvasLayout(img.naturalWidth, img.naturalHeight)` to keep the remote canvas sized to match the image aspect ratio.

## Why This Fully Fixes the Problem

Every user's drawing canvas is now exactly the same logical size as the screen content, with zero black-bar offset. Normalization divides by the content area size (not the container). Denormalization multiplies by the same content area size on the receiving end. Coordinates are now truly universal.
