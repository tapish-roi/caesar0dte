/**
 * LivestreamPage — Route-based entry point for joining a live session via shareable link.
 * URL: /livestream?session=<sessionId>
 * 
 * Flow:
 * 1. If session ID is in URL, auto-join that session
 * 2. If no session ID, show active sessions the user can join
 * 3. Requires authentication — redirects to /auth if not logged in
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Radio, ArrowRight, Users, Wifi, WifiOff } from 'lucide-react';
import LiveRoom from '@/components/LiveRoom';

interface ActiveSession {
  id: string;
  title: string;
  mentor_id: string;
  status: string;
  viewer_count: number;
}

export default function LivestreamPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionIdFromUrl = searchParams.get('session');

  const [joinedSession, setJoinedSession] = useState<ActiveSession | null>(null);

  // Fetch user profile for display name
  const { data: profile } = useQuery({
    queryKey: ['livestream-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  // If session ID is provided, fetch that specific session
  const { data: targetSession, isLoading: loadingTarget } = useQuery<ActiveSession | null>({
    queryKey: ['livestream-target', sessionIdFromUrl],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .select('id, title, mentor_id, status, viewer_count')
        .eq('id', sessionIdFromUrl!)
        .eq('status', 'active')
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!sessionIdFromUrl && !!user,
  });

  // Auto-join when target session is loaded
  useEffect(() => {
    if (targetSession && !joinedSession) {
      setJoinedSession(targetSession);
    }
  }, [targetSession, joinedSession]);

  // Fetch all active sessions (fallback when no session ID)
  const { data: activeSessions = [] } = useQuery<ActiveSession[]>({
    queryKey: ['livestream-active-sessions'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .select('id, title, mentor_id, status, viewer_count')
        .eq('status', 'active');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !sessionIdFromUrl,
    refetchInterval: 10000,
  });

  // Redirect to auth if not logged in
  if (!loading && !user) {
    navigate('/auth', { replace: true });
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
            <Radio className="w-5 h-5 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  const isMentor = role === 'mentor';
  const userName = profile?.full_name || user?.email || 'משתמש';

  // If in a session, show LiveRoom
  if (joinedSession && user) {
    return (
      <LiveRoom
        sessionId={joinedSession.id}
        mentorId={joinedSession.mentor_id}
        userId={user.id}
        userName={userName}
        sessionTitle={joinedSession.title}
        isMentor={isMentor && joinedSession.mentor_id === user.id}
        onClose={() => {
          setJoinedSession(null);
          navigate('/');
        }}
        onSessionEnd={undefined}
      />
    );
  }

  // Loading target session
  if (sessionIdFromUrl && loadingTarget) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">מתחבר ללייב...</p>
        </div>
      </div>
    );
  }

  // Session not found
  if (sessionIdFromUrl && !targetSession && !loadingTarget) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl card-shadow p-8 max-w-md w-full mx-4 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <WifiOff className="w-8 h-8 text-muted-foreground opacity-40" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">הלייב הסתיים</h2>
          <p className="text-sm text-muted-foreground mb-6">השידור שניסית להצטרף אליו כבר לא פעיל.</p>
          <button
            onClick={() => navigate('/')}
            className="h-11 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-all flex items-center gap-2 mx-auto"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            חזרה לדשבורד
          </button>
        </motion.div>
      </div>
    );
  }

  // Show available sessions
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl card-shadow p-8 max-w-md w-full"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">לייבים פעילים</h2>
            <p className="text-xs text-muted-foreground">בחר שידור להצטרפות</p>
          </div>
        </div>

        {activeSessions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Radio className="w-8 h-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">אין שידורים חיים כרגע</p>
            <p className="text-xs text-muted-foreground">בקרוב יתחיל שידור חדש</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map(session => (
              <button
                key={session.id}
                onClick={() => setJoinedSession(session)}
                className="w-full bg-surface rounded-xl border border-border hover:border-destructive/30 hover:bg-destructive/5 transition-all p-4 text-right group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-destructive animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{session.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {session.viewer_count > 0 ? `${session.viewer_count} צופים` : 'שידור חי'}
                    </p>
                  </div>
                  <span className="text-xs text-destructive font-bold">LIVE</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/')}
          className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
        >
          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          חזרה לדשבורד
        </button>
      </motion.div>
    </div>
  );
}
