import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users, CheckCircle2, Clock, Eye } from 'lucide-react';

interface ProgressEntry {
  student_id: string;
  watched_seconds: number;
  completed: boolean;
  last_watched_at: string | null;
  profile?: { full_name: string } | null;
  displayName?: string;
}

export default function LessonStudentProgress({ lessonId, mentorId, durationMinutes }: { lessonId: string; mentorId?: string; durationMinutes?: number | null }) {
  const { data: progress = [], isLoading } = useQuery<ProgressEntry[]>({
    queryKey: ['lesson-student-progress', lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('student_id, watched_seconds, completed, last_watched_at')
        .eq('lesson_id', lessonId);
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (p) => {
          const [{ data: profile }, cmRes] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('user_id', p.student_id).single(),
            mentorId
              ? supabase.from('community_members').select('display_name').eq('mentor_id', mentorId).eq('student_id', p.student_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          const dn = (cmRes.data as any)?.display_name;
          return { ...p, profile, displayName: dn || undefined };
        })
      );
      return enriched.sort((a, b) => b.watched_seconds - a.watched_seconds);
    },
  });

  const maxSeconds = (durationMinutes ?? 0) * 60;

  const formatWatched = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs} שניות`;
    return `${mins} דק׳ ${secs > 0 ? `${secs} שנ׳` : ''}`.trim();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('he-IL', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (progress.length === 0) {
    return (
      <div className="text-center py-6">
        <Eye className="w-6 h-6 mx-auto mb-2 text-muted-foreground opacity-30" />
        <p className="text-xs text-muted-foreground">אף תלמיד עדיין לא צפה בשיעור זה</p>
      </div>
    );
  }

  const completedCount = progress.filter(p => p.completed).length;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {progress.length} צפו
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
          {completedCount} השלימו
        </span>
      </div>

      {/* Student list */}
      <div className="space-y-2">
        {progress.map((p) => {
          const pct = maxSeconds > 0 ? Math.min(Math.round((p.watched_seconds / maxSeconds) * 100), 100) : 0;
          return (
            <div key={p.student_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {(p.displayName || p.profile?.full_name || '?')[0]}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate">
                    {p.displayName || p.profile?.full_name || 'תלמיד'}
                  </span>
                  <span className={`text-[10px] font-semibold shrink-0 ${p.completed ? 'text-accent' : 'text-muted-foreground'}`}>
                    {formatWatched(p.watched_seconds)}{maxSeconds > 0 ? ` / ${durationMinutes} דק׳` : ''}
                  </span>
                </div>
                {/* Progress bar */}
                {maxSeconds > 0 && (
                  <div className="w-full h-1.5 rounded-full bg-border mt-1.5">
                    <div
                      className={`h-full rounded-full transition-all ${p.completed ? 'bg-accent' : 'bg-primary/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                {/* Last watched */}
                {p.last_watched_at && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {p.completed ? 'הושלם' : 'נצפה לאחרונה'} · {formatDate(p.last_watched_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
