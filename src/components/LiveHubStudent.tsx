/**
 * LiveHubStudent — The student's Live section with 3 sub-screens:
 *   1. Scheduled (upcoming lives board) — with bell reminder button
 *   2. לייבים מוקלטים (past recorded lives)
 *   3. Live room (current active session)
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, isPast, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  CalendarDays, Play, Clock, Radio, Video,
  ChevronLeft, Bell, BellOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import LiveRoom from '@/components/LiveRoom';

interface ScheduledLive {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
}

interface LiveRecording {
  id: string;
  title: string;
  description: string | null;
  recording_url: string | null;
  duration_minutes: number | null;
  created_at: string;
}

interface ActiveSession {
  id: string;
  title: string;
  mentor_id: string;
  status: string;
  viewer_count: number;
}

interface Props {
  mentorId: string;
  mentorName: string;
  userId: string;
  userName: string;
  userProfile?: { full_name?: string; avatar_url?: string | null } | null;
}

type SubTab = 'scheduled' | 'recordings' | 'live';

export default function LiveHubStudent({ mentorId, mentorName, userId, userName, userProfile }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('live');
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [playingRecording, setPlayingRecording] = useState<LiveRecording | null>(null);

  const displayName = userProfile?.full_name || userName;

  const { data: scheduled = [] } = useQuery<ScheduledLive[]>({
    queryKey: ['live-scheduled-student', mentorId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_scheduled') as any)
        .select('*').eq('mentor_id', mentorId).order('scheduled_at');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  const { data: recordings = [] } = useQuery<LiveRecording[]>({
    queryKey: ['live-recordings-student', mentorId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_recordings') as any)
        .select('*').eq('mentor_id', mentorId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  const { data: activeSessions = [] } = useQuery<ActiveSession[]>({
    queryKey: ['live-sessions-active', mentorId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .select('id, title, mentor_id, status, viewer_count')
        .eq('mentor_id', mentorId).eq('status', 'active');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
    refetchInterval: 15000,
  });

  const upcomingLives = scheduled.filter(s => !isPast(parseISO(s.scheduled_at)));
  const pastScheduled = scheduled.filter(s => isPast(parseISO(s.scheduled_at)));
  const hasActiveSession = activeSessions.length > 0;

  const tabs: { key: SubTab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'live', label: 'לייב נוכחי', icon: Radio },
    { key: 'scheduled', label: 'לוח מודעות', icon: CalendarDays },
    { key: 'recordings', label: 'הקלטות', icon: Video },
  ];

  return (
    <div className="p-8 max-w-3xl" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">לייב</h1>
        <p className="text-sm text-muted-foreground mt-1">שידורים חיים וסשנים מ{mentorName}</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6 bg-muted/40 p-1 rounded-xl w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subTab === key ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === 'live' && hasActiveSession && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── LIVE TAB ── */}
        {subTab === 'live' && (
          <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {hasActiveSession ? (
              <div className="space-y-3">
                {activeSessions.map(session => (
                  <div key={session.id} className="bg-card rounded-2xl card-shadow p-5 border border-destructive/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <Radio className="w-6 h-6 text-destructive" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{session.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.viewer_count > 0 ? `${session.viewer_count} צופים` : 'שידור חי'}
                        </p>
                      </div>
                      <span className="mr-auto flex items-center gap-1.5 text-xs text-destructive font-bold">
                        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        LIVE
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveSession(session)}
                      className="w-full h-11 bg-destructive text-destructive-foreground rounded-xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <Radio className="w-4 h-4" />
                      הצטרף לשידור
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-2xl card-shadow p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Radio className="w-8 h-8 text-muted-foreground opacity-40" />
                </div>
                <p className="font-semibold text-foreground mb-1">אין שידור חי כרגע</p>
                <p className="text-sm text-muted-foreground">
                  {upcomingLives.length > 0
                    ? `השידור הבא מתוכנן ל-${format(parseISO(upcomingLives[0].scheduled_at), "d בMMMM 'בשעה' HH:mm", { locale: he })}`
                    : 'המנטור יפתח שידור חי בקרוב. תקבל התראה כשיתחיל.'}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── SCHEDULED TAB ── */}
        {subTab === 'scheduled' && (
          <motion.div key="scheduled" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {upcomingLives.length === 0 && pastScheduled.length === 0 ? (
              <div className="bg-card rounded-2xl card-shadow p-8 text-center">
                <CalendarDays className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="font-semibold text-foreground mb-1">לוח הלייבים ריק</p>
                <p className="text-sm text-muted-foreground">המנטור עדיין לא תזמן לייבים עתידיים</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingLives.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent" />
                      לייבים קרובים
                    </h2>
                    <div className="space-y-2">
                      {upcomingLives.map(item => {
                        const dt = parseISO(item.scheduled_at);
                        return (
                          <div key={item.id} className="bg-card rounded-xl card-shadow p-4 flex items-center gap-4 border border-accent/20">
                            <div className="shrink-0 text-center w-14 bg-accent/10 rounded-xl py-2">
                              <div className="text-lg font-bold text-accent leading-none">{format(dt, 'd', { locale: he })}</div>
                              <div className="text-[10px] text-muted-foreground">{format(dt, 'MMM', { locale: he })}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-foreground">{item.title}</p>
                              {item.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>}
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(dt, "HH:mm | EEEE", { locale: he })}
                              </p>
                            </div>
                            <div className="shrink-0 w-2 h-2 rounded-full bg-accent animate-pulse" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pastScheduled.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground mb-3">לייבים שהיו</h2>
                    <div className="space-y-2">
                      {pastScheduled.map(item => {
                        const dt = parseISO(item.scheduled_at);
                        return (
                          <div key={item.id} className="bg-card rounded-xl p-4 flex items-center gap-4 opacity-60">
                            <div className="shrink-0 text-center w-14 bg-muted rounded-xl py-2">
                              <div className="text-lg font-bold text-muted-foreground leading-none">{format(dt, 'd')}</div>
                              <div className="text-[10px] text-muted-foreground">{format(dt, 'MMM', { locale: he })}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-muted-foreground">{item.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(dt, "HH:mm | EEEE", { locale: he })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── RECORDINGS TAB ── */}
        {subTab === 'recordings' && (
          <motion.div key="recordings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {playingRecording ? (
              <div className="bg-card rounded-2xl card-shadow overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <button
                    onClick={() => setPlayingRecording(null)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    חזור להקלטות
                  </button>
                </div>
                <div className="aspect-video bg-black">
                  {playingRecording.recording_url ? (
                    <video src={playingRecording.recording_url} className="w-full h-full" controls autoPlay />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Video className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">הקלטה אינה זמינה</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h2 className="text-lg font-bold text-foreground">{playingRecording.title}</h2>
                  {playingRecording.description && <p className="text-sm text-muted-foreground mt-1">{playingRecording.description}</p>}
                  {playingRecording.duration_minutes && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />{playingRecording.duration_minutes} דקות
                    </p>
                  )}
                </div>
              </div>
            ) : recordings.length === 0 ? (
              <div className="bg-card rounded-2xl card-shadow p-8 text-center">
                <Video className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="font-semibold text-foreground mb-1">אין הקלטות עדיין</p>
                <p className="text-sm text-muted-foreground">לייבים שיוקלטו יופיעו כאן</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map(rec => (
                  <button
                    key={rec.id}
                    onClick={() => setPlayingRecording(rec)}
                    className="w-full bg-card rounded-xl card-shadow p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-right"
                  >
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Play className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{rec.title}</p>
                      {rec.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{rec.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(rec.created_at), 'dd.MM.yyyy', { locale: he })}
                        </span>
                        {rec.duration_minutes && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{rec.duration_minutes} דק'
                          </span>
                        )}
                      </div>
                    </div>
                    <Play className="w-5 h-5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Room Modal */}
      <AnimatePresence>
        {activeSession && (
          <LiveRoom
            sessionId={activeSession.id}
            mentorId={activeSession.mentor_id}
            userId={userId}
            userName={displayName}
            sessionTitle={activeSession.title}
            isMentor={false}
            onClose={() => setActiveSession(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
