/**
 * SpaceBackground — ambient depth for the dashboard.
 *
 * Three fixed parallax layers (Far / Mid drift / Near) plus a fine-grain
 * noise overlay. All layers sit behind the UI (z-index: 0) and use
 * transform-only animations on GPU (will-change: transform).
 *
 * Designed to be mounted ONCE per page root. The existing
 * `.main-content-gradient` color wash on <main> remains untouched
 * and serves as the primary "anchor" wash visible through these layers.
 */
export default function SpaceBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {/* Far layer — faint distant stars, drifts very slowly diagonally */}
      <div className="space-layer space-layer-far" />

      {/* Mid layer — soft nebula glow, slow drift, the "anchor" depth */}
      <div className="space-layer space-layer-mid" />

      {/* Near layer — small foreground particles, slightly faster */}
      <div className="space-layer space-layer-near" />

      {/* Fine grain noise overlay — breaks color banding */}
      <div className="space-noise" />
    </div>
  );
}
