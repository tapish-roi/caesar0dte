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

  const fetchRole = async (userId: string, metadataRole?: string): Promise<void> => {
    // Use SECURITY DEFINER RPC — bypasses RLS timing issues
    const { data } = await supabase.rpc('get_user_role', { _user_id: userId });

    if (data === 'mentor' || data === 'student') {
      setRole(data as AppRole);
      return;
    }

    // Retry once after 900ms — trigger may not have committed yet on fresh signup
    await sleep(900);
    const { data: data2 } = await supabase.rpc('get_user_role', { _user_id: userId });

    if (data2 === 'mentor' || data2 === 'student') {
      setRole(data2 as AppRole);
      return;
    }

    // Final fallback: use role from user_metadata (set at signup time)
    if (metadataRole === 'mentor' || metadataRole === 'student') {
      setRole(metadataRole as AppRole);
      return;
    }

    setRole(null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            const metadataRole = session.user.user_metadata?.role as string | undefined;
            await fetchRole(session.user.id, metadataRole);
          } else {
            setRole(null);
          }
        } finally {
          setLoading(false);
        }
      }
    );

    // Safety fallback
    const timeout = setTimeout(() => setLoading(false), 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

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
