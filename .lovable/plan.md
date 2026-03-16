
## Root Cause Analysis

The "stuck on כניסה" bug stems from a timing/race condition in `AuthContext.tsx`:

1. User signs up → Supabase creates the auth user → the DB trigger fires to insert into `profiles` and `user_roles`.
2. The `onAuthStateChange` fires with `SIGNED_IN` event.
3. `fetchRole` queries `user_roles` — but the DB trigger may not have committed yet, so it gets `null`.
4. With `role = null`, `App.tsx` renders `<AuthPage />` instead of a dashboard, making the user appear stuck.

Additionally, the `loading` flag can get stuck `true` if `fetchRole` throws before setting it to `false`.

## Fix Plan

### 1. Retry logic in `fetchRole` (AuthContext.tsx)
After signup, the DB trigger needs a moment to commit. Add a short retry: if the first query returns `null`, wait 800ms and try once more before giving up. This handles the race condition without polling.

### 2. Fallback: read role from `user_metadata`
If `user_roles` still returns nothing (e.g., trigger delay), fall back to `session.user.user_metadata.role` which is written at signup time and is immediately available. This ensures the dashboard always loads.

### 3. Guarantee `loading = false`
Wrap the entire `onAuthStateChange` callback body in `try/finally` so `setLoading(false)` is always called even if `fetchRole` throws.

### 4. Fix AnimatePresence ref warning (AuthPage.tsx)
The console shows a React ref warning from `AnimatePresence` wrapping the signup fields inside a `<form>`. Wrap the animated children in a `<div>` instead of a bare fragment to give framer-motion a proper DOM node to attach refs to.

## Files Changed
- `src/contexts/AuthContext.tsx` — retry + metadata fallback + loading guarantee
- `src/pages/AuthPage.tsx` — fix AnimatePresence ref warning

## No DB migration needed
The schema and trigger are already correct from the last migration. This is purely a client-side timing fix.
