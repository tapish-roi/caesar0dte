/**
 * ZoomHub — Anyone on the platform can start or join a video call.
 * Uses LiveRoomLK (LiveKit SFU) for the actual video/audio.
 *
 * Any authenticated user can:
 *  - Start a new call (they become the host)
 *  - See all active calls across the platform
 *  - Join any active call
 *  - Share a link for others to join directly
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Video, VideoOff, Users, Plus, Copy, Link2,
  PhoneOff, Loader2, RefreshCw,
} from 'lucide-react';
import LiveRoomLK from '@/components/LiveRoomLK';

interface ActiveSession {
  id: string;
  title: string;
  mentor_id: string;
  status: string;
  viewer_count: number;
}

interface Props {
  userId: string;
  userName: string;
}

export default function ZoomHub({ userId, userName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [newCallTitle, setNewCallTitle] = useState('');

  const { data: activeSessions = [], refetch, isFetching } = useQuery<ActiveSession[]>({
    queryKey: ['zoom-active-sessions'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .select('id, title, mentor_id, status, viewer_count')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const startCall = useMutation({
    mutationFn: async (title: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .insert({ mentor_id: userId, title, status: 'active' })
        .select('id, title, mentor_id, status, viewer_count')
        .single();
      if (error) throw error;
      return data as ActiveSession;
    },
    onSuccess: (data) => {
      setActiveSession(data);
      setNewCallTitle('');
      qc.invalidateQueries({ queryKey: ['zoom-active-sessions'] });
      toast({ title: 'שיחה נפתחה!' });
    },
    onError: () => toast({ title: 'שגיאה בפתיחת שיחה', variant: 'destructive' }),
  });

  const endCall = useCallback(async (sessionId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_sessions') as any)
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    setActiveSession(null);
    qc.invalidateQueries({ queryKey: ['zoom-active-sessions'] });
  }, [qc]);

  const copyLink = (sessionId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/livestream?session=${sessionId}&lk=1`);
    toast({ title: 'הקישור הועתק!' });
  };

  // ── In a call ──
  if (activeSession) {
    const isHost = activeSession.mentor_id === userId;
    return (
      <LiveRoomLK
        sessionId={activeSession.id}
        mentorId={activeSession.mentor_id}
        userId={userId}
        userName={userName}
        sessionTitle={activeSession.title}
        isMentor={isHost}
        onClose={() => {
          if (isHost) endCall(activeSession.id);
          else setActiveSession(null);
        }}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">שיחות וידאו</h1>
          <p className="text-sm text-muted-foreground mt-1">פתח שיחה חדשה או הצטרף לשיחה פעילה</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 h-9 w-9 rounded-lg bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
          title="רענן"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Start new call */}
      <div className="bg-card rounded-2xl card-shadow p-5 mb-6 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Video className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">פתח שיחה חדשה</h2>
            <p className="text-xs text-muted-foreground">תתחבר עם אחרים בוידאו + שמע</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newCallTitle}
            onChange={e => setNewCallTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newCallTitle.trim() && startCall.mutate(newCallTitle)}
            placeholder="שם השיחה (לדוגמה: ניתוח שוק בוקר)"
            className="flex-1 min-w-0 h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-right"
          />
          <button
            onClick={() => newCallTitle.trim() && startCall.mutate(newCallTitle)}
            disabled={!newCallTitle.trim() || startCall.isPending}
            className="h-11 px-5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
          >
            {startCall.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plus className="w-4 h-4" />
            }
            <span>{startCall.isPending ? 'פותח...' : 'התחל שיחה'}</span>
          </button>
        </div>
      </div>

      {/* Active sessions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          שיחות פעילות
          {activeSessions.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({activeSessions.length})</span>
          )}
        </h2>

        <AnimatePresence mode="popLayout">
          {activeSessions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-card rounded-2xl card-shadow p-10 text-center border border-border/50"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <VideoOff className="w-8 h-8 text-muted-foreground opacity-40" />
              </div>
              <p className="font-semibold text-foreground mb-1">אין שיחות פעילות כרגע</p>
              <p className="text-sm text-muted-foreground">פתח שיחה חדשה ושתף את הקישור</p>
            </motion.div>
          ) : (
            activeSessions.map(session => {
              const isMySession = session.mentor_id === userId;
              const shareLink = `${window.location.origin}/livestream?session=${session.id}&lk=1`;
              return (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-card rounded-xl card-shadow p-4 mb-3 border border-destructive/20"
                >
                  <div className="flex items-center gap-3 mb-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
                    <p className="font-bold text-sm text-foreground flex-1 truncate">{session.title}</p>
                    <span className="text-xs text-destructive font-bold shrink-0">LIVE</span>
                    {isMySession && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
                        השיחה שלי
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <Users className="w-3.5 h-3.5" />
                    <span>{session.viewer_count > 0 ? `${session.viewer_count} משתתפים` : 'פעיל'}</span>
                  </div>

                  {/* Shareable link */}
                  <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2 min-w-0">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1 min-w-0 font-mono select-all" dir="ltr">
                      {shareLink}
                    </span>
                    <button
                      onClick={() => copyLink(session.id)}
                      className="shrink-0 h-7 px-2.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      העתק
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveSession(session)}
                      className="flex-1 h-10 bg-destructive text-destructive-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <Video className="w-4 h-4" />
                      {isMySession ? 'חזור לשיחה' : 'הצטרף'}
                    </button>
                    {isMySession && (
                      <button
                        onClick={() => endCall(session.id)}
                        className="h-10 px-4 border border-destructive/30 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/10 transition-all flex items-center gap-1.5"
                      >
                        <PhoneOff className="w-4 h-4" />
                        סיים
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
