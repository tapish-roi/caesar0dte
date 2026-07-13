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

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          if (!active) return;
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            const metadataRole = session.user.user_metadata?.role as string | undefined;
            await fetchRole(session.user.id, metadataRole, () => active);
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
