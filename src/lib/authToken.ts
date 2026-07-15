// Read the access token WITHOUT going through supabase-js.
//
// Every supabase.auth.* and supabase.from(...) call acquires the client's auth
// lock (a Web Lock) to read the session. A poisoned/stale persisted session — or
// the app open in a second tab that grabbed the lock and never let go — wedges
// that lock, and then every SDK call hangs instead of erroring. That is the
// "invite button spins for 20s then times out" bug: the community_invites insert
// never even reaches the network because it is still waiting for the lock.
//
// supabase-js persists the session as plain JSON under this key (verified against
// auth-js setItemAsync, which does JSON.stringify with no base64 wrapping), so we
// can read the token straight from localStorage and never touch the lock. This is
// the same escape hatch AuthContext already uses to validate the session.
const AUTH_STORAGE_KEY = 'sb-dnsguhzzgxvymtjrraok-auth-token';

export interface StoredToken {
  token: string;
  /** true if the token's own exp has already passed. */
  expired: boolean;
}

export function getStoredAccessToken(): StoredToken | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null; // storage disabled (private mode / blocked cookies)
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    // Newer supabase-js stores the session object directly; older shapes nested
    // it under currentSession. Accept either.
    const session = parsed?.access_token ? parsed : parsed?.currentSession;
    const token: string | undefined = session?.access_token;
    if (!token) return null;

    // expires_at is unix seconds. Treat a token expiring within 30s as expired so
    // a request doesn't die mid-flight; 0/undefined means "unknown", not expired.
    const expiresAt: number | undefined = session?.expires_at;
    const expired = typeof expiresAt === 'number' && expiresAt > 0
      ? expiresAt * 1000 < Date.now() + 30_000
      : false;

    return { token, expired };
  } catch {
    return null; // corrupt JSON — treat as no session
  }
}
