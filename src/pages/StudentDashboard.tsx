import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, BookOpen, Users, Video, Film, FileText,
  LogOut, Clock, CheckCircle2, ChevronDown, Bell, MessageSquare,
  MessageCircle, Send, Image, Wifi, Pin, ChevronLeft, ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SidebarTab = 'lessons' | 'community';
type PostType = 'discussion' | 'media' | 'live';

interface InviteItem {
  id: string;
  mentor_id: string;
  contact: string;
  status: string;
  mentorName: string;
}

interface MembershipItem {
  mentor_id: string;
  mentorName: string;
  avatarLetter: string;
}

interface LessonItem {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  video_url: string | null;
  category_id: string | null;
  duration_minutes: number | null;
}

interface CategoryItem {
  id: string;
  title: string;
}

interface ProgressItem {
  lesson_id: string;
  progress_percent: number;
  completed: boolean;
}

interface PostItem {
  id: string;
  content: string;
  post_type: string;
  media_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  created_at: string;
  mentor_id: string;
  mentorName: string;
}

interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string } | null;
}

// ─── Community Picker Screen ──────────────────────────────────────────────────
function CommunityPicker({
  memberships,
  onSelect,
}: {
  memberships: MembershipItem[];
  onSelect: (mentorId: string) => void;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-10">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">TradeLearn</span>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-2">בחר קהילה</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          אתה חבר ב-{memberships.length} קהילות. בחר לאיזה קהילה להיכנס.
        </p>

        <div className="space-y-3">
          {memberships.map((m, i) => (
            <motion.button
              key={m.mentor_id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => onSelect(m.mentor_id)}
              className="w-full flex items-center gap-4 p-4 bg-card rounded-2xl card-shadow hover:bg-accent/5 active:scale-98 transition-all text-right group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                {m.avatarLetter}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">{m.mentorName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">קהילת מסחר</div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors rotate-180" />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTab>('lessons');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  // Selected community mentor
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  // Fetch pending invites
  const { data: invites = [] } = useQuery<InviteItem[]>({
    queryKey: ['student-invites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_invites')
        .select('id, mentor_id, contact, status')
        .eq('student_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (inv) => {
          const { data: p } = await supabase.from('profiles').select('full_name').eq('user_id', inv.mentor_id).single();
          return { ...inv, mentorName: p?.full_name ?? 'מנטור' };
        })
      );
      return enriched;
    },
    enabled: !!user,
  });

  // Fetch mentor memberships
  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<MembershipItem[]>({
    queryKey: ['memberships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_members')
        .select('mentor_id')
        .eq('student_id', user!.id);
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (m) => {
          const { data: p } = await supabase.from('profiles').select('full_name').eq('user_id', m.mentor_id).single();
          const name = p?.full_name ?? 'מנטור';
          return { ...m, mentorName: name, avatarLetter: name[0]?.toUpperCase() ?? 'מ' };
        })
      );
      return enriched;
    },
    enabled: !!user,
  });

  // Auto-select if only one community; show picker for multiple
  useEffect(() => {
    if (membershipsLoading) return;
    if (memberships.length === 1 && !selectedMentorId) {
      setSelectedMentorId(memberships[0].mentor_id);
    }
  }, [memberships, membershipsLoading]);

  const activeMembership = memberships.find(m => m.mentor_id === selectedMentorId);
  const mentorId = activeMembership?.mentor_id ?? null;
  const mentorName = activeMembership?.mentorName ?? null;

  // Fetch categories
  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ['student-categories', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, title')
        .eq('mentor_id', mentorId!)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  // Fetch published lessons
  const { data: lessons = [] } = useQuery<LessonItem[]>({
    queryKey: ['student-lessons', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, title, description, lesson_type, video_url, category_id, duration_minutes')
        .eq('mentor_id', mentorId!)
        .eq('is_published', true)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  // Fetch student lesson progress
  const { data: progress = [] } = useQuery<ProgressItem[]>({
    queryKey: ['progress', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('lesson_id, progress_percent, completed')
        .eq('student_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch community posts (pinned first, then newest)
  const { data: posts = [] } = useQuery<PostItem[]>({
    queryKey: ['student-posts', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('id, content, post_type, media_url, media_type, is_pinned, created_at, mentor_id')
        .eq('mentor_id', mentorId!)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (p) => {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', p.mentor_id).single();
          return { ...p, mentorName: profile?.full_name ?? 'מנטור' };
        })
      );
      return enriched as PostItem[];
    },
    enabled: !!mentorId && activeTab === 'community',
  });

  // Fetch comments for a post
  const fetchComments = async (postId: string): Promise<PostComment[]> => {
    const { data, error } = await supabase
      .from('community_post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at');
    if (error) throw error;
    const enriched = await Promise.all(
      (data ?? []).map(async (c) => {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', c.author_id).single();
        return { ...c, profiles: profile };
      })
    );
    return enriched;
  };

  // Realtime: subscribe to new posts + comments
  useEffect(() => {
    if (!mentorId || activeTab !== 'community') return;

    const channel = supabase
      .channel(`community-${mentorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_posts',
        filter: `mentor_id=eq.${mentorId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['student-posts', mentorId] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_post_comments',
      }, (payload) => {
        const postId = (payload.new as { post_id?: string })?.post_id || (payload.old as { post_id?: string })?.post_id;
        if (postId) qc.invalidateQueries({ queryKey: ['student-comments', postId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [mentorId, activeTab, qc]);

  // Accept invite
  const acceptInvite = useMutation({
    mutationFn: async (invite: { id: string; mentor_id: string }) => {
      await supabase.from('community_invites').update({ status: 'accepted' }).eq('id', invite.id);
      await supabase.from('community_members').insert({ mentor_id: invite.mentor_id, student_id: user!.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-invites'] });
      qc.invalidateQueries({ queryKey: ['memberships'] });
      toast({ title: 'הצטרפת לקהילה!', description: 'כעת יש לך גישה לשיעורים ולקהילה.' });
    },
  });

  // Decline invite
  const declineInvite = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('community_invites').update({ status: 'declined' }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-invites'] }),
  });

  // Add comment
  const addComment = useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      const { error } = await supabase.from('community_post_comments').insert({
        post_id: postId,
        author_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      qc.invalidateQueries({ queryKey: ['student-comments', postId] });
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
    },
    onError: () => toast({ title: 'שגיאה בשליחת תגובה', variant: 'destructive' }),
  });

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  };

  const getProgress = (lessonId: string) => progress.find((p) => p.lesson_id === lessonId);
  const selectedLessonData = lessons.find((l) => l.id === selectedLesson);

  const typeIcon = (type: string) => {
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-blue-500" />;
    if (type === 'resource') return <FileText className="w-3.5 h-3.5 text-amber-500" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const postTypeLabel: Record<string, string> = { discussion: 'דיון', media: 'מדיה', live: 'לייב' };
  const postTypeBg: Record<string, string> = {
    discussion: 'bg-blue-500/10', media: 'bg-emerald-500/10', live: 'bg-red-500/10',
  };
  const postTypeColor: Record<string, string> = {
    discussion: 'text-blue-500', media: 'text-emerald-500', live: 'text-red-500',
  };
  const postTypeIcon = (type: string) => {
    if (type === 'live') return <Wifi className="w-3.5 h-3.5" />;
    if (type === 'media') return <Image className="w-3.5 h-3.5" />;
    return <MessageCircle className="w-3.5 h-3.5" />;
  };
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ── Loading ──
  if (membershipsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Community Picker: show when multiple memberships and none selected ──
  if (memberships.length > 1 && !selectedMentorId) {
    return (
      <>
        {/* Invite banners above picker */}
        <AnimatePresence>
          {invites.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-0 left-0 right-0 z-50 border-b border-amber-200 bg-amber-50"
              dir="rtl"
            >
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-8 py-3">
                  <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 flex-1">
                    <span className="font-semibold">{inv.mentorName}</span> הזמין אותך להצטרף לקהילה שלו
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptInvite.mutate({ id: inv.id, mentor_id: inv.mentor_id })}
                      className="h-8 px-4 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                    >
                      הצטרף
                    </button>
                    <button
                      onClick={() => declineInvite.mutate(inv.id)}
                      className="h-8 px-3 bg-card border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 transition-all"
                    >
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <CommunityPicker memberships={memberships} onSelect={setSelectedMentorId} />
      </>
    );
  }

  // ── No memberships ──
  if (memberships.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        {/* Invite banners */}
        <AnimatePresence>
          {invites.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="border-b border-amber-200 bg-amber-50"
            >
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-8 py-3">
                  <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 flex-1">
                    <span className="font-semibold">{inv.mentorName}</span> הזמין אותך להצטרף לקהילה שלו
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptInvite.mutate({ id: inv.id, mentor_id: inv.mentor_id })}
                      className="h-8 px-4 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                    >
                      הצטרף
                    </button>
                    <button
                      onClick={() => declineInvite.mutate(inv.id)}
                      className="h-8 px-3 bg-card border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 transition-all"
                    >
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold text-foreground">טרם הצטרפת לקהילה</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              המנטור שלך ישלח לך הזמנה לאימייל. ברגע שתקבל הזמנה, היא תופיע כאן.
            </p>
            <button onClick={signOut} className="mt-4 text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5 mx-auto">
              <LogOut className="w-3.5 h-3.5" />
              התנתק
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full Dashboard ──
  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 h-full">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm text-sidebar-foreground">TradeLearn</div>
              <div className="text-xs text-muted-foreground">תלמיד</div>
            </div>
          </div>
        </div>

        {/* Active community + switch button */}
        {mentorName && (
          <div className="px-4 py-3 border-b border-sidebar-border bg-accent/5">
            <p className="text-xs text-muted-foreground">קהילה נוכחית</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{mentorName}</p>
            {memberships.length > 1 && (
              <button
                onClick={() => setSelectedMentorId(null)}
                className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:opacity-80 transition-opacity"
              >
                <ChevronLeft className="w-3 h-3" />
                החלף קהילה
              </button>
            )}
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          {([
            { key: 'lessons', label: 'שיעורים', icon: BookOpen },
            { key: 'community', label: 'קהילה', icon: Users },
          ] as { key: SidebarTab; label: string; icon: typeof BookOpen }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === key
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{user?.email}</div>
            </div>
            <button onClick={signOut} className="text-muted-foreground hover:text-destructive transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Invite banners */}
        <AnimatePresence>
          {invites.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="border-b border-amber-200 bg-amber-50"
            >
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-8 py-3">
                  <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 flex-1">
                    <span className="font-semibold">{inv.mentorName}</span> הוזמנת להצטרף לקהילת {inv.mentorName}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptInvite.mutate({ id: inv.id, mentor_id: inv.mentor_id })}
                      className="h-8 px-4 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                    >
                      הצטרף
                    </button>
                    <button
                      onClick={() => declineInvite.mutate(inv.id)}
                      className="h-8 px-3 bg-card border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 transition-all"
                    >
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* ──────── LESSONS ──────── */}
          {activeTab === 'lessons' && (
            <motion.div key="lessons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8">
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-foreground">הקורסים שלי</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {lessons.length} שיעורים זמינים · {progress.filter((p) => p.completed).length} הושלמו
                  </p>
                </div>

                <AnimatePresence>
                  {selectedLessonData && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="bg-card rounded-xl card-shadow mb-6 overflow-hidden"
                    >
                      <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
                        {selectedLessonData.video_url ? (
                          <video
                            src={selectedLessonData.video_url}
                            className="w-full h-full"
                            controls
                            title={selectedLessonData.title}
                          />
                        ) : (
                          <div className="text-center text-slate-500">
                            <Video className="w-12 h-12 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">אין קובץ וידאו</p>
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <h2 className="text-xl font-bold text-foreground mb-2">{selectedLessonData.title}</h2>
                        {selectedLessonData.description && (
                          <p className="text-sm text-muted-foreground">{selectedLessonData.description}</p>
                        )}
                        {selectedLessonData.duration_minutes && (
                          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{selectedLessonData.duration_minutes} דקות</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                  {categories.map((cat) => {
                    const catLessons = lessons.filter((l) => l.category_id === cat.id);
                    if (catLessons.length === 0) return null;
                    const isExpanded = expandedCats.has(cat.id);
                    const completedCount = catLessons.filter((l) => getProgress(l.id)?.completed).length;
                    return (
                      <div key={cat.id} className="bg-card rounded-xl card-shadow overflow-hidden">
                        <div
                          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleCat(cat.id)}
                        >
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          <span className="font-semibold text-foreground flex-1">{cat.title}</span>
                          <span className="text-xs text-muted-foreground">{completedCount}/{catLessons.length} הושלמו</span>
                          {completedCount === catLessons.length && catLessons.length > 0 && (
                            <CheckCircle2 className="w-4 h-4 text-accent" />
                          )}
                        </div>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                              <div className="border-t border-border">
                                {catLessons.map((lesson) => {
                                  const prog = getProgress(lesson.id);
                                  return (
                                    <div
                                      key={lesson.id}
                                      onClick={() => setSelectedLesson(lesson.id === selectedLesson ? null : lesson.id)}
                                      className={`flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${selectedLesson === lesson.id ? 'bg-accent/5' : ''}`}
                                    >
                                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                                        {prog?.completed ? <CheckCircle2 className="w-5 h-5 text-accent" /> : typeIcon(lesson.lesson_type)}
                                      </div>
                                      <span className={`text-sm flex-1 ${selectedLesson === lesson.id ? 'font-medium text-accent' : 'text-foreground'}`}>
                                        {lesson.title}
                                      </span>
                                      {lesson.duration_minutes && (
                                        <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
                                      )}
                                      {prog && !prog.completed && prog.progress_percent > 0 && (
                                        <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                                          <div className="h-full bg-accent rounded-full" style={{ width: `${prog.progress_percent}%` }} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {lessons.filter((l) => !l.category_id).map((lesson) => {
                    const prog = getProgress(lesson.id);
                    return (
                      <motion.div
                        key={lesson.id}
                        whileHover={{ y: -2 }}
                        onClick={() => setSelectedLesson(lesson.id === selectedLesson ? null : lesson.id)}
                        className="bg-card rounded-xl card-shadow p-4 flex items-center gap-3 cursor-pointer transition-all"
                      >
                        {typeIcon(lesson.lesson_type)}
                        <span className="text-sm text-foreground flex-1">{lesson.title}</span>
                        {lesson.duration_minutes && (
                          <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
                        )}
                        {prog?.completed && <CheckCircle2 className="w-4 h-4 text-accent" />}
                      </motion.div>
                    );
                  })}

                  {lessons.length === 0 && (
                    <div className="text-center py-16 text-muted-foreground">
                      <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">עדיין אין תכנים</p>
                      <p className="text-sm mt-1">המנטור שלך יעלה תכנים בקרוב.</p>
                    </div>
                  )}
                </div>
              </>
            </motion.div>
          )}

          {/* ──────── COMMUNITY ──────── */}
          {activeTab === 'community' && (
            <motion.div key="community" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 max-w-2xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">קהילה</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {mentorName ? `עדכונים מ${mentorName}` : 'עדכונים מהמנטור שלך'}
                </p>
              </div>

              {posts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">אין עדכונים עדיין</p>
                  <p className="text-sm mt-1">המנטור שלך יפרסם עדכונים בקרוב</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <StudentPostCard
                      key={post.id}
                      post={post}
                      fetchComments={fetchComments}
                      expanded={expandedComments.has(post.id)}
                      onToggleComments={() => toggleComments(post.id)}
                      commentText={commentTexts[post.id] ?? ''}
                      onCommentChange={(val) => setCommentTexts(prev => ({ ...prev, [post.id]: val }))}
                      onAddComment={() => {
                        const text = commentTexts[post.id]?.trim();
                        if (text) addComment.mutate({ postId: post.id, content: text });
                      }}
                      postTypeLabel={postTypeLabel}
                      postTypeIcon={postTypeIcon}
                      postTypeBg={postTypeBg}
                      postTypeColor={postTypeColor}
                      formatDate={formatDate}
                      queryClient={qc}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── StudentPostCard ──────────────────────────────────────────────────────────
function StudentPostCard({
  post, fetchComments, expanded, onToggleComments,
  commentText, onCommentChange, onAddComment,
  postTypeLabel, postTypeIcon, postTypeBg, postTypeColor, formatDate, queryClient,
}: {
  post: PostItem;
  fetchComments: (id: string) => Promise<PostComment[]>;
  expanded: boolean;
  onToggleComments: () => void;
  commentText: string;
  onCommentChange: (v: string) => void;
  onAddComment: () => void;
  postTypeLabel: Record<string, string>;
  postTypeIcon: (t: string) => React.ReactNode;
  postTypeBg: Record<string, string>;
  postTypeColor: Record<string, string>;
  formatDate: (s: string) => string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data: comments = [], isLoading: commentsLoading } = useQuery<PostComment[]>({
    queryKey: ['student-comments', post.id],
    queryFn: () => fetchComments(post.id),
    enabled: expanded,
  });

  const pType = post.post_type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card rounded-2xl card-shadow overflow-hidden ${post.is_pinned ? 'ring-2 ring-primary/20' : ''}`}
    >
      <div className="p-5">
        {/* Pin indicator */}
        {post.is_pinned && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-3">
            <Pin className="w-3 h-3" />
            נעוץ
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {post.mentorName[0]?.toUpperCase() ?? 'M'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{post.mentorName}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${postTypeBg[pType] ?? 'bg-muted'} ${postTypeColor[pType] ?? 'text-foreground'}`}>
                {pType === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {postTypeIcon(pType)}
                {postTypeLabel[pType] ?? pType}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{formatDate(post.created_at)}</div>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {/* Media */}
        {post.media_url && (
          <div className="mt-3 rounded-xl overflow-hidden">
            {post.media_type === 'video' ? (
              <video src={post.media_url} className="w-full max-h-72 object-cover rounded-xl" controls />
            ) : (
              <img src={post.media_url} alt="post" className="w-full max-h-72 object-cover rounded-xl" />
            )}
          </div>
        )}

        {/* Comment toggle */}
        <button
          onClick={onToggleComments}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {expanded ? 'הסתר תגובות' : `תגובות${comments.length > 0 ? ` (${comments.length})` : ''}`}
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 pb-4 pt-3">
              {commentsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">אין תגובות עדיין — היה הראשון!</p>
              ) : (
                <div className="space-y-3 mb-3">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold shrink-0">
                        {c.profiles?.full_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 bg-muted/40 rounded-xl px-3 py-2">
                        <div className="text-xs font-medium text-foreground mb-0.5">{c.profiles?.full_name ?? 'תלמיד'}</div>
                        <p className="text-xs text-foreground leading-relaxed">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              <div className="flex gap-2 mt-2">
                <textarea
                  value={commentText}
                  onChange={e => onCommentChange(e.target.value)}
                  placeholder="כתוב תגובה..."
                  rows={1}
                  className="flex-1 px-3 py-2 bg-surface border-none ring-1 ring-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(); } }}
                />
                <button
                  onClick={onAddComment}
                  disabled={!commentText.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
