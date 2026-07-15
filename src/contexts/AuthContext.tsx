import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'mentor' | 'student' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Public project identifiers (same values as integrations/supabase/client.ts —
// the anon key is a public client key). Needed here to validate a persisted
// session and to purge it from storage without going through the auth lock.
const SUPABASE_URL = 'https://dnsguhzzgxvymtjrraok.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2d1aHp6Z3h2eW10anJyYW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MTA2MjAsImV4cCI6MjA5MzI4NjYyMH0.5llm0eyAmfbHi19YHYnUc2nHDi1yITpXrw-ccKcEyms';
const AUTH_STORAGE_KEY = 'sb-dnsguhzzgxvymtjrraok-auth-token';

// Independently confirm with the server that a session's access token is
// genuine. supabase-js restores sessions from localStorage and trusts them
// locally, so a forged/tampered token (attacker-writable storage) would
// otherwise paint the app. This uses a raw fetch — NOT supabase.auth.getUser()
// — because a poisoned session can wedge the client's auth lock, hanging every
// SDK call; a plain fetch bypasses that entirely and returns in milliseconds.
//   'valid'   – server accepted the JWT (200)
//   'invalid' – server rejected it (401/403): forged, expired, or revoked
//   'unknown' – network/timeout: cannot decide, so do NOT punish the user
const validateAccessToken = async (
  token: string,
): Promise<'valid' | 'invalid' | 'unknown'> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.ok) return 'valid';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [loading, setLoading] = useState(true);

  // The authoritative role comes ONLY from the get_user_role RPC (SECURITY DEFINER,
  // backed by the server-controlled user_roles table). `user_metadata.role` is
  // user-writable, so it is used solely as an optimistic paint that the RPC always
  // reconciles — including downgrading a forged 'mentor' hint back to its real value.
  // `isActive` guards against setState after unmount / out-of-order auth events.
  const fetchRole = async (
    userId: string,
    metadataRole: string | undefined,
    isActive: () => boolean,
  ): Promise<void> => {
    if (metadataRole === 'mentor' || metadataRole === 'student') {
      if (isActive()) setRole(metadataRole as AppRole);
    }

    let { data, error } = await supabase.rpc('get_user_role', { _user_id: userId });
    // Retry once — trigger may not have committed yet on fresh signup
    if (!error && data == null) {
      await sleep(900);
      ({ data, error } = await supabase.rpc('get_user_role', { _user_id: userId }));
    }
    if (!isActive()) return;
    if (data === 'mentor' || data === 'student') {
      setRole(data as AppRole);
    } else {
      // RPC is authoritative: no server-side role means no role, regardless of metadata.
      setRole(null);
    }
  };

  // Tear down a session locally without relying on the supabase client, whose
  // auth lock can be wedged by a poisoned session. Removing the storage key
  // directly guarantees the forged/expired session is gone on the next load;
  // the SDK sign-out is best-effort and must not be awaited (it may hang).
  const hardLocalSignOut = () => {
    try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* storage disabled */ }
    void supabase.auth.signOut({ scope: 'local' }).catch(() => { /* lock may be wedged */ });
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          if (!active) return;
          // NOTE: this callback runs while supabase-js holds its auth lock
          // (e.g. during session recovery / token refresh). Do NOT await a
          // network request here — it would hold the lock and stall every data
          // query. Server-side session validation is done in a separate effect
          // below, decoupled from the lock.
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            const metadataRole = session.user.user_metadata?.role as string | undefined;
            // fetchRole calls supabase.rpc(), which needs the auth lock. This
            // callback RUNS while the lock is held (during detectSessionInUrl /
            // recovery / refresh), so awaiting it here deadlocks: the rpc waits
            // for the lock the callback holds, forever. That is what froze the
            // accept-invite "join" button — getSession() there never returned.
            // Fire it WITHOUT await so the callback returns and releases the lock;
            // the rpc then proceeds. The decoupled effect below is the backstop.
            void fetchRole(session.user.id, metadataRole, () => active);
          } else if (active) {
            setRole(null);
          }
        } finally {
          if (active) setLoading(false);
        }
      }
    );

    // Safety fallback
    const timeout = setTimeout(() => { if (active) setLoading(false); }, 6000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Server-side session validation, decoupled from supabase's auth-state
  // callback (which runs while the auth lock is held). A session restored from
  // localStorage may be forged/tampered — supabase-js trusts it locally, so
  // without this a credential-less visitor would paint the app (data stays
  // protected by RLS, but the UI must still refuse to render). validateAccessToken
  // uses a raw fetch (no auth lock) and a definitive rejection purges the session
  // and routes back to /auth; a network error leaves it alone. Re-runs whenever
  // the access token changes (initial load, refresh, login).
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let active = true;
    (async () => {
      const verdict = await validateAccessToken(token);
      if (active && verdict === 'invalid') hardLocalSignOut();
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // If user is set but role is still null (e.g. stale session on reload), re-fetch role
  useEffect(() => {
    let active = true;
    if (user && !role && !loading) {
      const metadataRole = user.user_metadata?.role as string | undefined;
      fetchRole(user.id, metadataRole, () => active);
    }
    return () => { active = false; };
  }, [user, role, loading]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
