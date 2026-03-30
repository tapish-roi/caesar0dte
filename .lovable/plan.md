

## Analysis: Why only 36 seconds recorded instead of 1:30

**Root cause identified:** The continuous-play detection threshold is too strict. The interval fires every 1000ms, but on slower devices or when the browser is busy, the interval can fire every 2-3 seconds. When this happens, `delta` (difference in `currentTime` between ticks) exceeds the threshold of `2`, and the tick is **rejected as a "skip"** — even though the student was watching continuously.

Over 90 seconds of playback, if many ticks are rejected due to slightly delayed intervals, only ~40% of the real watch time gets counted — explaining the 36 seconds.

**Secondary issue:** No progress save on component unmount (e.g., when the student navigates away without pausing).

## Plan

### 1. Increase delta threshold in VideoPlayer
In `src/pages/StudentDashboard.tsx`, change the continuous-play detection from `delta < 2` to `delta < 5`. A real user seek/skip typically jumps 10+ seconds, while a delayed interval tick produces deltas of 2-4 seconds. A threshold of 5 safely distinguishes the two.

### 2. Add progress save on unmount
Add a cleanup function that calls `saveProgress(true)` when the VideoPlayer component unmounts, so progress is never lost when navigating away.

### 3. Use actual elapsed wall-clock time as fallback
Track wall-clock time (via `Date.now()`) alongside `currentTime` to cross-validate. If the interval fires late but both wall-clock and video time advanced by similar amounts, it's continuous playback — not a seek.

**Files to modify:** `src/pages/StudentDashboard.tsx` (VideoPlayer component only, ~5 lines changed)

