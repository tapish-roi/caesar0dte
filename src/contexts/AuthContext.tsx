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
    // First attempt
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (data?.role) {
      setRole(data.role as AppRole);
      return;
    }

    // Retry after 800ms — trigger may not have committed yet
    await sleep(800);
    const { data: data2 } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (data2?.role) {
      setRole(data2.role as AppRole);
      return;
    }

    // Final fallback: use role from user_metadata (set at signup)
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
