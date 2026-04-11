/**
 * LiveHubMentor — Mentor's Live section:
 *   1. Manage scheduled lives (create/edit/delete)
 *   2. Manage recordings ("לייבים מוקלטים") — auto-saved after session ends
 *   3. Start/host live session (Discord-style)
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays, Plus, Radio, Video, Clock, Trash2,
  Pencil, X, Check, Upload, Play, ChevronLeft, Link2, Copy,
} from 'lucide-react';
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
}

interface Props {
  mentorId: string;
  userId: string;
  userName: string;
}

type SubTab = 'live' | 'scheduled' | 'recordings';

// Upload a blob (auto-recorded session) to storage and return public URL
async function uploadRecordingBlob(mentorId: string, blob: Blob): Promise<string> {
  const path = `live-recordings/${mentorId}/${Date.now()}.webm`;
  const { data, error } = await supabase.storage.from('lesson-assets').upload(path, blob, {
    contentType: 'video/webm', upsert: false,
  });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
  return publicUrl;
}

export default function LiveHubMentor({ mentorId, userId, userName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('live');

  // Schedule form
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editScheduled, setEditScheduled] = useState<ScheduledLive | null>(null);
  const [schedForm, setSchedForm] = useState({ title: '', description: '', scheduled_at: '' });

  // Recording form
  const [showRecForm, setShowRecForm] = useState(false);
  const [editRecording, setEditRecording] = useState<LiveRecording | null>(null);
  const [recForm, setRecForm] = useState({ title: '', description: '', recording_url: '', duration_minutes: '' });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live session
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [newLiveTitle, setNewLiveTitle] = useState('');
  const [playingRecording, setPlayingRecording] = useState<LiveRecording | null>(null);

  // ── Queries ──
  const { data: scheduled = [] } = useQuery<ScheduledLive[]>({
    queryKey: ['live-scheduled-mentor', mentorId],
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
    queryKey: ['live-recordings-mentor', mentorId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_recordings') as any)
        .select('*').eq('mentor_id', mentorId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  const { data: activeSessions = [], refetch: refetchSessions } = useQuery<ActiveSession[]>({
    queryKey: ['live-sessions-mentor', mentorId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .select('id, title, mentor_id, status')
        .eq('mentor_id', mentorId).eq('status', 'active');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
    refetchInterval: 10000,
  });

  // ── Mutations ──
  const saveScheduled = useMutation({
    mutationFn: async () => {
      if (editScheduled) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('live_scheduled') as any)
          .update({ title: schedForm.title, description: schedForm.description || null, scheduled_at: schedForm.scheduled_at })
          .eq('id', editScheduled.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('live_scheduled') as any)
          .insert({ mentor_id: mentorId, title: schedForm.title, description: schedForm.description || null, scheduled_at: schedForm.scheduled_at });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-scheduled-mentor', mentorId] });
      setShowScheduleForm(false); setEditScheduled(null);
      setSchedForm({ title: '', description: '', scheduled_at: '' });
      toast({ title: editScheduled ? 'לייב מתוזמן עודכן' : 'לייב נוסף ללוח' });
    },
    onError: () => toast({ title: 'שגיאה בשמירה', variant: 'destructive' }),
  });

  const deleteScheduled = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('live_scheduled') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['live-scheduled-mentor', mentorId] }),
  });

  const saveRecording = useMutation({
    mutationFn: async () => {
      const payload = {
        mentor_id: mentorId,
        title: recForm.title,
        description: recForm.description || null,
        recording_url: recForm.recording_url || null,
        duration_minutes: recForm.duration_minutes ? parseInt(recForm.duration_minutes) : null,
      };
      if (editRecording) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('live_recordings') as any).update(payload).eq('id', editRecording.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('live_recordings') as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-recordings-mentor', mentorId] });
      setShowRecForm(false); setEditRecording(null);
      setRecForm({ title: '', description: '', recording_url: '', duration_minutes: '' });
      toast({ title: editRecording ? 'הקלטה עודכנה' : 'הקלטה נוספה' });
    },
    onError: () => toast({ title: 'שגיאה בשמירה', variant: 'destructive' }),
  });

  const deleteRecording = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('live_recordings') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['live-recordings-mentor', mentorId] }),
  });

  const startLiveSession = useMutation({
    mutationFn: async (title: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('live_sessions') as any)
        .insert({ mentor_id: mentorId, title, status: 'active' })
        .select('id, title, mentor_id, status').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setActiveSession(data);
      refetchSessions();
      toast({ title: 'שידור חי התחיל!' });
    },
    onError: () => toast({ title: 'שגיאה בפתיחת שידור', variant: 'destructive' }),
  });

  const handleSessionEnd = useCallback(async (recordingBlob: Blob, durationSeconds: number, title: string, description: string) => {
    try {
      toast({ title: '⏳ שומר את הלייב המוקלט...' });
      const url = await uploadRecordingBlob(mentorId, recordingBlob);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('live_recordings') as any).insert({
        mentor_id: mentorId,
        title: title || 'לייב מוקלט',
        description: description || null,
        recording_url: url,
        duration_minutes: Math.round(durationSeconds / 60) || 1,
      });
      qc.invalidateQueries({ queryKey: ['live-recordings-mentor', mentorId] });
      qc.invalidateQueries({ queryKey: ['live-recordings-student', mentorId] });
      toast({ title: '✅ הלייב נשמר ב"לייבים מוקלטים"' });
    } catch {
      toast({ title: 'שגיאה בשמירת ההקלטה', variant: 'destructive' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorId, qc, toast]);

  const endLiveSession = useCallback(async (sessionId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('live_sessions') as any).update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', sessionId);
    setActiveSession(null);
    refetchSessions();
  }, [refetchSessions]);

  const handleVideoUpload = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `live-recordings/${mentorId}/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
      return publicUrl;
    } finally {
      setIsUploading(false);
    }
  };

  const tabs: { key: SubTab; label: string; icon: typeof Radio }[] = [
    { key: 'live', label: 'שידור חי', icon: Radio },
    { key: 'scheduled', label: 'לוח מודעות', icon: CalendarDays },
    { key: 'recordings', label: 'לייבים מוקלטים', icon: Video },
  ];

  const openSchedEdit = (item: ScheduledLive) => {
    setEditScheduled(item);
    setSchedForm({
      title: item.title,
      description: item.description ?? '',
      scheduled_at: item.scheduled_at.slice(0, 16),
    });
    setShowScheduleForm(true);
  };

  const openRecEdit = (item: LiveRecording) => {
    setEditRecording(item);
    setRecForm({
      title: item.title,
      description: item.description ?? '',
      recording_url: item.recording_url ?? '',
      duration_minutes: item.duration_minutes?.toString() ?? '',
    });
    setShowRecForm(true);
  };

  return (
    <div className="p-8 max-w-3xl" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">ניהול לייב</h1>
        <p className="text-sm text-muted-foreground mt-1">נהל שידורים, לוח מודעות והקלטות</p>
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
            {key === 'live' && activeSessions.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── LIVE TAB ── */}
        {subTab === 'live' && (
          <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {activeSessions.length === 0 ? (
              <div className="bg-card rounded-2xl card-shadow p-6">
                <h2 className="font-semibold text-foreground mb-1">פתח לייב חדש</h2>
                <p className="text-sm text-muted-foreground mb-4">תן שם ללייב ופתח שידור — התלמידים יראו את הלייב ויוכלו להצטרף</p>
                <div className="flex gap-2">
                  <input
                    value={newLiveTitle}
                    onChange={e => setNewLiveTitle(e.target.value)}
                    placeholder="שם השידור (לדוגמה: ניתוח שבועי)"
                    className="flex-1 h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    onKeyDown={e => e.key === 'Enter' && newLiveTitle.trim() && startLiveSession.mutate(newLiveTitle)}
                  />
                  <button
                    onClick={() => newLiveTitle.trim() && startLiveSession.mutate(newLiveTitle)}
                    disabled={!newLiveTitle.trim() || startLiveSession.isPending}
                    className="h-11 px-5 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
                  >
                    <Radio className="w-4 h-4" />
                    {startLiveSession.isPending ? 'מתחיל...' : 'התחל שידור'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map(session => {
                  const shareLink = `${window.location.origin}/livestream?session=${session.id}`;
                  return (
                    <div key={session.id} className="bg-card rounded-2xl card-shadow p-5 border border-destructive/20">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                        <span className="font-bold text-foreground">{session.title}</span>
                        <span className="text-xs text-destructive font-bold mr-auto">LIVE</span>
                      </div>

                      {/* Shareable link */}
                      <div className="flex items-center gap-2 mb-4 bg-muted/40 rounded-lg px-3 py-2">
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate flex-1 select-all font-mono" dir="ltr">{shareLink}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(shareLink);
                            toast({ title: '🔗 הלינק הועתק!' });
                          }}
                          className="shrink-0 h-7 px-2.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />העתק
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveSession(session)}
                          className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                        >
                          <Radio className="w-4 h-4" />פתח שידור
                        </button>
                        <button
                          onClick={() => endLiveSession(session.id)}
                          className="h-10 px-4 border border-destructive/30 text-destructive rounded-xl text-sm font-medium hover:bg-destructive/10 transition-all"
                        >
                          סיים שידור
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── SCHEDULED TAB ── */}
        {subTab === 'scheduled' && (
          <motion.div key="scheduled" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">לוח לייבים מתוזמנים</h2>
              <button
                onClick={() => { setEditScheduled(null); setSchedForm({ title: '', description: '', scheduled_at: '' }); setShowScheduleForm(true); }}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
              >
                <Plus className="w-4 h-4" />הוסף לייב
              </button>
            </div>

            <AnimatePresence>
              {showScheduleForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="bg-card rounded-xl card-shadow p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{editScheduled ? 'ערוך לייב מתוזמן' : 'לייב מתוזמן חדש'}</h3>
                    <input
                      value={schedForm.title} onChange={e => setSchedForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="כותרת הלייב"
                      className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    />
                    <input
                      value={schedForm.description} onChange={e => setSchedForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="תיאור קצר (אופציונלי)"
                      className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    />
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">תאריך ושעה</label>
                      <input
                        type="datetime-local"
                        value={schedForm.scheduled_at} onChange={e => setSchedForm(f => ({ ...f, scheduled_at: e.target.value }))}
                        className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setShowScheduleForm(false); setEditScheduled(null); }} className="h-9 px-4 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-all">
                        ביטול
                      </button>
                      <button
                        onClick={() => saveScheduled.mutate()}
                        disabled={!schedForm.title.trim() || !schedForm.scheduled_at || saveScheduled.isPending}
                        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {saveScheduled.isPending ? 'שומר...' : 'שמור'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {scheduled.length === 0 ? (
              <div className="bg-card rounded-2xl card-shadow p-8 text-center">
                <CalendarDays className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
                <p className="font-semibold text-foreground mb-1">לוח מודעות ריק</p>
                <p className="text-sm text-muted-foreground">הוסף תאריכי לייב כדי שהתלמידים יוכלו לתכנן מראש</p>
              </div>
            ) : (
              <div className="space-y-2">
                {scheduled.map(item => {
                  const dt = parseISO(item.scheduled_at);
                  return (
                    <div key={item.id} className="bg-card rounded-xl card-shadow p-4 flex items-center gap-4 group">
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
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openSchedEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteScheduled.mutate(item.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                  <button onClick={() => setPlayingRecording(null)} className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80">
                    <ChevronLeft className="w-4 h-4" />חזור להקלטות
                  </button>
                </div>
                <div className="aspect-video bg-black">
                  {playingRecording.recording_url
                    ? <video src={playingRecording.recording_url} className="w-full h-full" controls autoPlay controlsList="nodownload" onContextMenu={e => e.preventDefault()} />
                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Video className="w-12 h-12 opacity-30" /></div>
                  }
                </div>
                <div className="p-5 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{playingRecording.title}</h2>
                    {playingRecording.description && <p className="text-sm text-muted-foreground mt-1">{playingRecording.description}</p>}
                  </div>
                  <button
                    onClick={() => { setPlayingRecording(null); openRecEdit(playingRecording); }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-all shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />ערוך
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-foreground">הקלטות לייב</h2>
                  <button
                    onClick={() => { setEditRecording(null); setRecForm({ title: '', description: '', recording_url: '', duration_minutes: '' }); setShowRecForm(true); }}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
                  >
                    <Plus className="w-4 h-4" />הוסף הקלטה
                  </button>
                </div>

                <AnimatePresence>
                  {showRecForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mb-4"
                    >
                      <div className="bg-card rounded-xl card-shadow p-5 space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">{editRecording ? 'ערוך הקלטה' : 'הקלטה חדשה'}</h3>
                        <input
                          value={recForm.title} onChange={e => setRecForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="כותרת ההקלטה"
                          className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                        />
                        <input
                          value={recForm.description} onChange={e => setRecForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="תיאור (אופציונלי)"
                          className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                        />
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1.5">קובץ וידאו</label>
                          <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const url = await handleVideoUpload(file);
                                setRecForm(f => ({ ...f, recording_url: url }));
                                toast({ title: 'הסרטון הועלה בהצלחה' });
                              } catch { toast({ title: 'שגיאה בהעלאה', variant: 'destructive' }); }
                            }}
                          />
                          {recForm.recording_url ? (
                            <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                              <Check className="w-4 h-4 text-accent" />
                              <span className="text-xs text-accent flex-1 truncate">הסרטון הועלה</span>
                              <button onClick={() => setRecForm(f => ({ ...f, recording_url: '' }))} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                              className="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                            >
                              {isUploading
                                ? <><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span className="text-xs">מעלה...</span></>
                                : <><Upload className="w-5 h-5" /><span className="text-xs font-medium">העלה קובץ הקלטה</span></>
                              }
                            </button>
                          )}
                        </div>
                        <input
                          type="number" value={recForm.duration_minutes} onChange={e => setRecForm(f => ({ ...f, duration_minutes: e.target.value }))}
                          placeholder="משך בדקות (אופציונלי)"
                          className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setShowRecForm(false); setEditRecording(null); }} className="h-9 px-4 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-all">ביטול</button>
                          <button
                            onClick={() => saveRecording.mutate()}
                            disabled={!recForm.title.trim() || saveRecording.isPending || isUploading}
                            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                          >
                            {saveRecording.isPending ? 'שומר...' : 'שמור'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {recordings.length === 0 ? (
                  <div className="bg-card rounded-2xl card-shadow p-8 text-center">
                    <Video className="w-12 h-12 text-muted-foreground opacity-30 mx-auto mb-3" />
                    <p className="font-semibold text-foreground mb-1">אין הקלטות עדיין</p>
                    <p className="text-sm text-muted-foreground">העלה הקלטות לייב שתלמידים יוכלו לצפות בהן</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recordings.map(rec => (
                      <div key={rec.id} className="bg-card rounded-xl card-shadow p-4 flex items-center gap-4 group">
                        <button onClick={() => setPlayingRecording(rec)} className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-all">
                          <Play className="w-6 h-6 text-primary" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground">{rec.title}</p>
                          {rec.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{rec.description}</p>}
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">{format(parseISO(rec.created_at), 'dd.MM.yyyy', { locale: he })}</span>
                            {rec.duration_minutes && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{rec.duration_minutes} דק'</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openRecEdit(rec)} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteRecording.mutate(rec.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
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
            userName={userName}
            sessionTitle={activeSession.title}
            isMentor={true}
            onClose={() => {
              endLiveSession(activeSession.id);
            }}
            onSessionEnd={(blob, dur, title, desc) => handleSessionEnd(blob, dur, title, desc)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
