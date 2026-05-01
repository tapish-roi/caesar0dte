/**
 * ZoomHub — Share and join real Zoom meetings.
 *
 * Any authenticated user can:
 *  - Post an active Zoom meeting link (title + URL or meeting ID)
 *  - See all active Zoom sessions posted by anyone
 *  - Click "Join on Zoom" to open the meeting in Zoom (browser/app)
 *  - End their own session when done
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Video, VideoOff, Users, ExternalLink, Copy,
  Plus, PhoneOff, Loader2, RefreshCw, Link2,
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

interface Props {
  userId: string;
  userName: string;
}

/** Normalise a raw Zoom input into a full joinable URL */
function normaliseZoomUrl(raw: string): string {
  const trimmed = raw.trim();
  // Already a full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  // Plain meeting ID like 123 456 789
  const digits = trimmed.replace(/\s+/g, '');
  if (/^\d{9,11}$/.test(digits)) return `https://zoom.us/j/${digits}`;
  // zoom.us/j/... without protocol
  if (trimmed.startsWith('zoom.us/')) return `https://${trimmed}`;
  return trimmed;
}

export default function ZoomHub({ userId, userName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [zoomInput, setZoomInput] = useState('');

  const { data: sessions = [], isFetching, refetch } = useQuery<ZoomSession[]>({
    queryKey: ['zoom-sessions'],
    queryFn: async () => {
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

  const postSession = useMutation({
    mutationFn: async () => {
      const zoom_url = normaliseZoomUrl(zoomInput);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('zoom_sessions') as any)
        .insert({ host_id: userId, host_name: userName, title, zoom_url, status: 'active' })
        .select('id, host_id, host_name, title, zoom_url, status, created_at')
        .single();
      if (error) throw error;
      return data as ZoomSession;
    },
    onSuccess: () => {
      setTitle('');
      setZoomInput('');
      qc.invalidateQueries({ queryKey: ['zoom-sessions'] });
      toast({ title: 'שיחת Zoom פורסמה!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום השיחה', variant: 'destructive' }),
  });

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
    toast({ title: 'קישור Zoom הועתק!' });
  };

  const canPost = title.trim() && zoomInput.trim();

  return (
    <div className="p-4 md:p-8 max-w-2xl" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Zoom</h1>
          <p className="text-sm text-muted-foreground mt-1">שתף קישור Zoom כדי שאחרים יוכלו להצטרף</p>
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

      {/* Post a new Zoom session */}
      <div className="bg-card rounded-2xl card-shadow p-5 mb-6 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground text-sm">פתח שיחת Zoom</h2>
            <p className="text-xs text-muted-foreground">הזן כינוי לשיחה וקישור / מזהה הפגישה</p>
          </div>
        </div>

        <div className="space-y-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="שם הפגישה (לדוגמה: ניתוח בוקר)"
            className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/60 text-right"
          />
          <input
            value={zoomInput}
            onChange={e => setZoomInput(e.target.value)}
            placeholder="קישור Zoom או מזהה פגישה — 123 456 7890"
            className="w-full h-10 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/60 font-mono"
            dir="ltr"
          />
          <button
            onClick={() => canPost && postSession.mutate()}
            disabled={!canPost || postSession.isPending}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {postSession.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plus className="w-4 h-4" />
            }
            {postSession.isPending ? 'מפרסם...' : 'שתף שיחה'}
          </button>
        </div>
      </div>

      {/* Active Zoom sessions */}
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
              <p className="text-sm text-muted-foreground">שתף קישור Zoom כדי שהקהילה תוכל להצטרף</p>
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
                  {/* Title row */}
                  <div className="flex items-center gap-3 mb-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <p className="font-bold text-sm text-foreground flex-1 truncate">{session.title}</p>
                    {isHost && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium shrink-0">
                        שלי
                      </span>
                    )}
                  </div>

                  {/* Host */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                    <Users className="w-3.5 h-3.5" />
                    <span>מארח: {session.host_name}</span>
                  </div>

                  {/* Zoom URL display */}
                  <div className="flex items-center gap-2 mb-3 bg-muted/40 rounded-lg px-3 py-2 min-w-0">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate flex-1 min-w-0 font-mono select-all" dir="ltr">
                      {session.zoom_url}
                    </span>
                    <button
                      onClick={() => copyLink(session.zoom_url)}
                      className="shrink-0 h-7 px-2.5 rounded-md bg-blue-500/10 text-blue-500 text-xs font-medium hover:bg-blue-500/20 transition-all flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      העתק
                    </button>
                  </div>

                  {/* Actions */}
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
