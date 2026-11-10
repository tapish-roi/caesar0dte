// Snapshot of the URL hash at page load, taken before supabase-js initializes
// and strips it. Auth redirects put either the session (#access_token=...) or
// the failure (#error=access_denied&error_code=otp_expired...) there, and the
// accept-invite / reset-password pages need to read it after the client has
// already cleared it. Must be the first import in main.tsx.
export const INITIAL_HASH: string = typeof window !== 'undefined' ? window.location.hash || '' : '';

export function initialHashParam(name: string): string | null {
  const raw = INITIAL_HASH.replace(/^#/, '');
  if (!raw) return null;
  return new URLSearchParams(raw).get(name);
}
