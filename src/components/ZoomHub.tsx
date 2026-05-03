/**
 * ZoomHub — Create, schedule, and join Zoom meetings.
 *
 * Mentors can:
 *   • Instantly create a Zoom meeting (shared live with the class)
 *   • Schedule a future Zoom meeting (shown to everyone with a countdown)
 *   • Cancel a scheduled meeting
 *
 * Students can:
 *   • See and join live meetings
 *   • See upcoming scheduled meetings with a countdown
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Video, VideoOff, Users, ExternalLink, Copy,
  Plus, PhoneOff, Loader2, RefreshCw, Link2, ChevronDown,
  CalendarClock, Clock, Trash2, CalendarPlus,
} from 'lucide-react';

interface ZoomSession {
  id: string;
  host_id: string;
  host_name: string;
  title: string;
  zoom_url: string;
  status: string;
  created_at: string;
}

interface ZoomScheduled {
  id: string;
  host_id: string;
  host_name: string;
  title: string;
  scheduled_at: string;
  zoom_url: string;
  meeting_id: string | null;
  status: string;
}

interface Props {
  userId: string;
  userName: string;
  isMentor?: boolean;
}

function normaliseZoomUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const digits = trimmed.replace(/\s+/g, '');
  if (/^\d{9,11}$/.test(digits)) return `https://zoom.us/j/${digits}`;
  if (trimmed.startsWith('zoom.us/')) return `https://${trimmed}`;
  return trimmed;
}

function useCountdown(target: string) {
  const [diff, setDiff] = useState(() => new Date(target).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(new Date(target).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return diff;
}

function CountdownBadge({ scheduledAt }: { scheduledAt: string }) {
  const diff = useCountdown(scheduledAt);
  if (diff <= 0) return <span className="text-xs font-semibold text-green-400 animate-pulse">מתחיל עכשיו!</span>;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const parts = [];
  if (h > 0) parts.push(`${h}ש'`);
  if (h > 0 || m > 0) parts.push(`${m}ד'`);
  parts.push(`${s}ש"`);
  return <span className="text-xs text-muted-foreground tabular-nums">בעוד {parts.join(' ')}</span>;
}

function formatScheduledTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('he-IL', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Opens Google Calendar with a pre-filled event for the scheduled Zoom. */
function openGoogleCalendar(title: string, hostName: string, scheduledAt: string, zoomUrl: string) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1-hour default

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `זום עם ${hostName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `${title}\n\nקישור לפגישת Zoom:\n${zoomUrl}`,
    location: zoomUrl,
  });

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
}

export default function ZoomHub({ userId, userName, isMentor = false }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');

  // Realtime: instantly reflect DB changes on all clients
  useEffect(() => {
    const ch1 = supabase
      .channel('zoom_sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zoom_sessions' },
        () => qc.invalidateQueries({ queryKey: ['zoom-sessions'] }))
      .subscribe();

    const ch2 = supabase
      .channel('zoom_scheduled_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zoom_scheduled' },
        () => qc.invalidateQueries({ queryKey: ['zoom-scheduled'] }))
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [qc]);

  // ── Live sessions ────────────────────────────────────────────────────
  const { data: sessions = [], isFetching, refetch } = useQuery<ZoomSession[]>({
    queryKey: ['zoom-sessions'],
    queryFn: async () => {
      await supabase.functions.invoke('sync-zoom-sessions').catch(() => {});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('zoom_sessions') as any)
        .select('id, host_id, host_name, title, zoom_url, status, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // ── Scheduled meetings ───────────────────────────────────────────────
  const { data: scheduled = [] } = useQuery<ZoomScheduled[]>({
    queryKey: ['zoom-scheduled'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('zoom_scheduled') as any)
        .select('id, host_id, host_name, title, scheduled_at, zoom_url, meeting_id, status')
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // hide meetings >1h past
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // ── Save live session ────────────────────────────────────────────────
  const saveSession = async (zoom_url: string, sessionTitle: string, meeting_id?: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('zoom_sessions') as any).insert({
      host_id: userId,
      host_name: userName,
      title: sessionTitle,
      zoom_url,
      status: 'active',
      ...(meeting_id ? { meeting_id: String(meeting_id) } : {}),
    });
    if (error) throw error;
  };

  // ── Create instant meeting ───────────────────────────────────────────
  const createMeeting = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
        body: { title },
      });
      if (error) throw new Error(error.message || 'Failed to create meeting');
      if (data?.error) throw new Error(data.error);
      await saveSession(data.join_url, title, data.meeting_id);
      return data;
    },
    onSuccess: () => {
      setTitle('');
      qc.invalidateQueries({ queryKey: ['zoom-sessions'] });
      toast({ title: '✅ פגישת Zoom נוצרה ושותפה!' });
    },
    onError: (err: Error) => toast({ title: 'שגיאה ביצירת פגישת Zoom', description: err.message, variant: 'destructive' }),
  });

  // ── Manual paste ─────────────────────────────────────────────────────
  const postManual = useMutation({
    mutationFn: async () => {
      const zoom_url = normaliseZoomUrl(manualUrl);
      await saveSession(zoom_url, title);
    },
    onSuccess: () => {
      setTitle(''); setManualUrl(''); setShowManual(false);
      qc.invalidateQueries({ queryKey: ['zoom-sessions'] });
      toast({ title: 'קישור Zoom שותף!' });
    },
    onError: () => toast({ title: 'שגיאה בשמירה', variant: 'destructive' }),
  });

  // ── Schedule meeting ─────────────────────────────────────────────────
  const scheduleMeeting = useMutation({
    mutationFn: async () => {
      if (!schedDate || !schedTime) throw new Error('בחר תאריך ושעה');
      const scheduled_at = new Date(`${schedDate}T${schedTime}`).toISOString();
      const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
        body: { title: schedTitle, scheduled_at },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: dbErr } = await (supabase.from('zoom_scheduled') as any).insert({
        host_id: userId,
        host_name: userName,
        title: schedTitle,
        scheduled_at,
        zoom_url: data.join_url,
        meeting_id: String(data.meeting_id),
        status: 'scheduled',
      });
      if (dbErr) throw dbErr;
    },
    onSuccess: () => {
      setSchedTitle(''); setSchedDate(''); setSchedTime(''); setShowSchedule(false);
      qc.invalidateQueries({ queryKey: ['zoom-scheduled'] });
      toast({ title: '📅 פגישה תוזמנה בהצלחה!' });
    },
    onError: (err: Error) => toast({ title: 'שגיאה בתזמון', description: err.message, variant: 'destructive' }),
  });

  // ── Cancel scheduled ─────────────────────────────────────────────────
  const cancelScheduled = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('zoom_scheduled') as any)
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zoom-scheduled'] });
      toast({ title: 'פגישה בוטלה' });
    },
    onError: () => toast({ title: 'שגיאה בביטול', variant: 'destructive' }),
  });

  // ── End live session ─────────────────────────────────────────────────
  const endSession = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('zoom_sessions') as any)
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['zoom-sessions'] });
      toast({ title: 'שיחה הוסרה' });
    },
    onError: () => toast({ title: 'שגיאה', variant: 'destructive' }),
  });

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: 'קישור הועתק!' });
  };

  const canCreate = title.trim().length > 0;
  const canPostManual = title.trim().length > 0 && manualUrl.trim().length > 0;
  const canSchedule = schedTitle.trim().length > 0 && schedDate && schedTime;
  const isWorking = createMeeting.isPending || postManual.isPending;

  // Min date/time for schedule picker (now)
  const nowDate = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-2xl" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Zoom</h1>
          <p className="text-sm text-muted-foreground mt-1">פגישות חיות ומתוזמנות</p>
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

      {/* ── MENTOR: Create / Schedule ───────────────────────────────── */}
      {isMentor && (
        <div className="bg-card rounded-2xl card-shadow p-5 mb-6 border border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-sm">פתח פגישת Zoom חדשה</h2>
              <p className="text-xs text-muted-foreground">פגישה תיפתח אוטומטית ותשותף עם הכיתה</p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canCreate && !isWorking && createMeeting.mutate()}
              placeholder="שם הפגישה (לדוגמה: ניתוח בוקר)"
              className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/60 text-right"
              disabled={isWorking}
            />

            <button
              onClick={() => createMeeting.mutate()}
              disabled={!canCreate || isWorking}
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMeeting.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />יוצר פגישה...</>
                : <><Plus className="w-4 h-4" />צור פגישה עכשיו</>}
            </button>

            {/* Schedule toggle */}
            <button
              onClick={() => setShowSchedule(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto pt-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSchedule ? 'rotate-180' : ''}`} />
              <CalendarClock className="w-3.5 h-3.5" />
              תזמן פגישה עתידית
            </button>

            <AnimatePresence>
              {showSchedule && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 space-y-2 border-t border-border/50">
                    <input
                      value={schedTitle}
                      onChange={e => setSchedTitle(e.target.value)}
                      placeholder="שם הפגישה המתוזמנת"
                      className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-right"
                      disabled={scheduleMeeting.isPending}
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={schedDate}
                        min={nowDate}
                        onChange={e => setSchedDate(e.target.value)}
                        className="flex-1 h-10 px-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        disabled={scheduleMeeting.isPending}
                      />
                      <input
                        type="time"
                        value={schedTime}
                        min={schedDate === nowDate ? nowTime : undefined}
                        onChange={e => setSchedTime(e.target.value)}
                        className="flex-1 h-10 px-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        disabled={scheduleMeeting.isPending}
                      />
                    </div>
                    <button
                      onClick={() => scheduleMeeting.mutate()}
                      disabled={!canSchedule || scheduleMeeting.isPending}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {scheduleMeeting.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />מתזמן...</>
                        : <><CalendarClock className="w-3.5 h-3.5" />תזמן פגישה</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Manual paste toggle */}
            <button
              onClick={() => setShowManual(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto pt-0"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
              הדבק קישור Zoom ידנית
            </button>

            <AnimatePresence>
              {showManual && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-1 space-y-2">
                    <input
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      placeholder="קישור Zoom או מזהה פגישה"
                      className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                      dir="ltr"
                      disabled={isWorking}
                    />
                    <button
                      onClick={() => postManual.mutate()}
                      disabled={!canPostManual || isWorking}
                      className="w-full h-10 border border-blue-500/40 text-blue-500 hover:bg-blue-500/10 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {postManual.isPending
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />שומר...</>
                        : <><Link2 className="w-3.5 h-3.5" />שתף קישור</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Scheduled meetings ──────────────────────────────────────── */}
      {scheduled.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-400" />
            פגישות מתוזמנות
            <span className="text-xs font-normal text-muted-foreground">({scheduled.length})</span>
          </h2>

          <div className="space-y-3">
            {scheduled.map(s => {
              const isPast = new Date(s.scheduled_at).getTime() < Date.now();
              const isHost = s.host_id === userId;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className={`bg-card rounded-xl card-shadow p-4 border ${isPast ? 'border-green-500/40' : 'border-indigo-500/20'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-sm text-foreground truncate">{s.title}</p>
                    {isHost && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-medium shrink-0">שלי</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>מארח: {s.host_name}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs mb-3">
                    <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-muted-foreground">{formatScheduledTime(s.scheduled_at)}</span>
                    <span className="mx-1 text-border">·</span>
                    <CountdownBadge scheduledAt={s.scheduled_at} />
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={s.zoom_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {isPast ? 'הצטרף' : 'הצטרף מוקדם'}
                    </a>
                    <button
                      onClick={() => openGoogleCalendar(s.title, s.host_name, s.scheduled_at, s.zoom_url)}
                      className="h-9 px-3 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs flex items-center gap-1.5 transition-all"
                      title="הוסף ל-Google Calendar"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">יומן</span>
                    </button>
                    <button
                      onClick={() => copyLink(s.zoom_url)}
                      className="h-9 px-3 rounded-xl bg-muted text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-all"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {isHost && (
                      <button
                        onClick={() => cancelScheduled.mutate(s.id)}
                        disabled={cancelScheduled.isPending}
                        className="h-9 px-3 border border-destructive/30 text-destructive rounded-xl text-sm hover:bg-destructive/10 transition-all flex items-center gap-1 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Live sessions ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          פגישות Zoom פעילות
          {sessions.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({sessions.length})</span>
          )}
        </h2>

        <AnimatePresence mode="popLayout">
          {sessions.length === 0 ? (
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
              <p className="font-semibold text-foreground mb-1">אין פגישות Zoom פעילות</p>
              <p className="text-sm text-muted-foreground">
                {isMentor ? 'פתח פגישה כדי שהקהילה תוכל להצטרף' : 'המנטור טרם פתח פגישה'}
              </p>
            </motion.div>
          ) : (
            sessions.map(session => {
              const isHost = session.host_id === userId;
              return (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-card rounded-xl card-shadow p-4 mb-3 border border-blue-500/20"
                >
                  <div className="flex items-center gap-3 mb-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <p className="font-bold text-sm text-foreground flex-1 truncate">{session.title}</p>
                    {isHost && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium shrink-0">שלי</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Users className="w-3.5 h-3.5" />
                    <span>מארח: {session.host_name}</span>
                  </div>

                  <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2 min-w-0">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1 min-w-0 font-mono select-all" dir="ltr">
                      {session.zoom_url}
                    </span>
                    <button
                      onClick={() => copyLink(session.zoom_url)}
                      className="shrink-0 h-7 px-2.5 rounded-md bg-blue-500/10 text-blue-500 text-xs font-medium hover:bg-blue-500/20 transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />העתק
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={session.zoom_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      הצטרף ב-Zoom
                    </a>
                    {isHost && (
                      <button
                        onClick={() => endSession.mutate(session.id)}
                        disabled={endSession.isPending}
                        className="h-10 px-4 border border-destructive/30 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/10 transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <PhoneOff className="w-4 h-4" />סיים
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
