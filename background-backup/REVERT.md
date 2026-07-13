# Background revert kit — restore the Spline 3D background

Backup made 2026-07-11, before switching the dashboard background from the live
Spline 3D scene to `VideoBackground` (pre-rendered video loops).

Nothing here is imported by the app — it's a cold backup. To go back to the old
Spline background, do the 3 steps below.

## What changed in the switch

- `src/components/SplineBackground.tsx` — the original Spline component. **Still
  present and unchanged** in `src/components/` (just no longer used). A copy is
  kept in this folder (`SplineBackground.tsx`) in case it ever gets deleted.
- `src/components/VideoBackground.tsx` — the new video component (added).
- `src/pages/MentorDashboard.tsx` and `src/pages/StudentDashboard.tsx` — their
  import line and the background JSX were swapped from `SplineBackground` to
  `VideoBackground`.

## How to revert

### 1. Make sure the component exists
If `src/components/SplineBackground.tsx` is missing, copy it back:

```sh
cp background-backup/SplineBackground.tsx src/components/SplineBackground.tsx
```

### 2. MentorDashboard.tsx
Change the import back:

```tsx
import SplineBackground, { type Planet } from '@/components/SplineBackground';
```

Change the background JSX back to:

```tsx
      <SplineBackground activePlanet={
        activeTab === 'lessons'   ? 'earth' :
        activeTab === 'community' ? 'moon' :
        activeTab === 'students'  ? 'mars' :
        activeTab === 'questions' ? 'saturn' :
        activeTab === 'zoom'      ? 'jupiter' :
        'earth' as Planet
      } />
```

### 3. StudentDashboard.tsx
Change the import back:

```tsx
import SplineBackground, { type Planet } from '@/components/SplineBackground';
```

Change the background JSX back to (note: `live` maps to `mars` here, not
`students`):

```tsx
      <SplineBackground activePlanet={
        activeTab === 'lessons'   ? 'earth' :
        activeTab === 'community' ? 'moon' :
        activeTab === 'live'      ? 'mars' :
        activeTab === 'questions' ? 'saturn' :
        activeTab === 'zoom'      ? 'jupiter' :
        'earth' as Planet
      } />
```

Then `npm run build` (or restart the dev server). You can leave
`VideoBackground.tsx` in place — it's harmless when unused.

## Note
Reverting to Spline brings back the ~4.5 MB `react-spline` + Rapier physics
download and the low-end-PC lag that prompted the switch. Consider the "adaptive
tiering" option (Spline for high-end devices, video for everyone else) instead of
a full revert.
