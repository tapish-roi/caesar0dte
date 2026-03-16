import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, BookOpen, Users, Video, Film, FileText,
  LogOut, Clock, CheckCircle2, ChevronDown, Bell, MessageSquare
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SidebarTab = 'lessons' | 'community';

export default function StudentDashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTab>('lessons');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);

  // Fetch pending invites for current student
  const { data: invites = [] } = useQuery({
    queryKey: ['student-invites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_invites')
        .select('*, profiles!community_invites_mentor_id_fkey(full_name)')
        .eq('student_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch mentor IDs the student is member of
  const { data: memberships = [] } = useQuery({
    queryKey: ['memberships', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_members')
        .select('mentor_id, profiles!community_members_mentor_id_fkey(full_name, email)')
        .eq('student_id', user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const mentorId = memberships[0]?.mentor_id;

  // Fetch categories for mentor
  const { data: categories = [] } = useQuery({
    queryKey: ['student-categories', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('mentor_id', mentorId!)
        .order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!mentorId,
  });

  // Fetch published lessons for mentor
  const { data: lessons = [] } = useQuery({
    queryKey: ['student-lessons', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('mentor_id', mentorId!)
        .eq('is_published', true)
        .order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!mentorId,
  });

  // Fetch student lesson progress
  const { data: progress = [] } = useQuery({
    queryKey: ['progress', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch community posts
  const { data: posts = [] } = useQuery({
    queryKey: ['posts', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*, profiles!community_posts_mentor_id_fkey(full_name)')
        .eq('mentor_id', mentorId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!mentorId && activeTab === 'community',
  });

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

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getProgress = (lessonId: string) =>
    progress.find((p: { lesson_id: string }) => p.lesson_id === lessonId);

  const selectedLessonData = lessons.find((l: { id: string }) => l.id === selectedLesson);

  const typeIcon = (type: string) => {
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-blue-500" />;
    if (type === 'resource') return <FileText className="w-3.5 h-3.5 text-amber-500" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const mentorProfile = memberships[0];

  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      {/* Right Sidebar */}
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

        {mentorProfile && (
          <div className="px-4 py-3 border-b border-sidebar-border bg-accent/5">
            <p className="text-xs text-muted-foreground">המנטור שלך</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {(mentorProfile as { profiles: { full_name: string } | null }).profiles?.full_name ?? 'מנטור'}
            </p>
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
            <button onClick={signOut} className="text-muted-foreground hover:text-destructive transition-colors" title="התנתק">
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
              {invites.map((inv: { id: string; mentor_id: string; profiles: { full_name: string } | null }) => (
                <div key={inv.id} className="flex items-center gap-4 px-8 py-3">
                  <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 flex-1">
                    <span className="font-semibold">
                      {inv.profiles?.full_name ?? 'מנטור'}
                    </span>{' '}
                    הזמין אותך להצטרף לקהילה שלו!
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
                      className="h-8 px-3 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-50 transition-all"
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
          {activeTab === 'lessons' && (
            <motion.div
              key="lessons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8"
            >
              {!mentorId ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <BookOpen className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">עדיין לא הצטרפת לקהילה</h2>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    המנטור שלך ישלח לך הזמנה לאימייל שלך. ברגע שתקבל הזמנה, היא תופיע בראש הדף.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-8">
                    <h1 className="text-2xl font-bold text-foreground">הקורסים שלי</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      {lessons.length} שיעורים זמינים · {progress.filter((p: { completed: boolean }) => p.completed).length} הושלמו
                    </p>
                  </div>

                  {/* Selected lesson viewer */}
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
                            <iframe
                              src={selectedLessonData.video_url.replace('watch?v=', 'embed/')}
                              className="w-full h-full"
                              allowFullScreen
                            />
                          ) : (
                            <div className="text-center text-slate-500">
                              <Video className="w-12 h-12 mx-auto mb-2 opacity-40" />
                              <p className="text-sm">אין קישור וידאו</p>
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

                  {/* Course content */}
                  <div className="space-y-3">
                    {categories.map((cat: { id: string; title: string }) => {
                      const catLessons = lessons.filter((l: { category_id: string }) => l.category_id === cat.id);
                      if (catLessons.length === 0) return null;
                      const isExpanded = expandedCats.has(cat.id);
                      const completedCount = catLessons.filter((l: { id: string }) => getProgress(l.id)?.completed).length;

                      return (
                        <div key={cat.id} className="bg-card rounded-xl card-shadow overflow-hidden">
                          <div
                            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => toggleCat(cat.id)}
                          >
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                            />
                            <span className="font-semibold text-foreground flex-1">{cat.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {completedCount}/{catLessons.length} הושלמו
                            </span>
                            {completedCount === catLessons.length && catLessons.length > 0 && (
                              <CheckCircle2 className="w-4 h-4 text-accent" />
                            )}
                          </div>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-border">
                                  {catLessons.map((lesson: { id: string; title: string; lesson_type: string; duration_minutes: number | null }) => {
                                    const prog = getProgress(lesson.id);
                                    return (
                                      <motion.div
                                        key={lesson.id}
                                        whileHover={{ backgroundColor: '#f8fafc' }}
                                        onClick={() => setSelectedLesson(lesson.id === selectedLesson ? null : lesson.id)}
                                        className={`flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors ${
                                          selectedLesson === lesson.id ? 'bg-accent/5' : ''
                                        }`}
                                      >
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                                          {prog?.completed
                                            ? <CheckCircle2 className="w-5 h-5 text-accent" />
                                            : typeIcon(lesson.lesson_type)
                                          }
                                        </div>
                                        <span className={`text-sm flex-1 ${selectedLesson === lesson.id ? 'font-medium text-accent' : 'text-foreground'}`}>
                                          {lesson.title}
                                        </span>
                                        {lesson.duration_minutes && (
                                          <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
                                        )}
                                        {prog && !prog.completed && prog.progress_percent > 0 && (
                                          <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                                            <div
                                              className="h-full bg-accent rounded-full"
                                              style={{ width: `${prog.progress_percent}%` }}
                                            />
                                          </div>
                                        )}
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {/* Uncategorized lessons */}
                    {lessons.filter((l: { category_id: string | null }) => !l.category_id).map((lesson: { id: string; title: string; lesson_type: string; duration_minutes: number | null }) => {
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
                        <p className="text-sm mt-1">עדיין אין תכנים בקטגוריה זו. המנטור שלך יעלה תכנים בקרוב.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div
              key="community"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 max-w-2xl"
            >
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">קהילה</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  עדכונים מהמנטור שלך
                </p>
              </div>

              {!mentorId ? (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">הצטרף לקהילה כדי לראות עדכונים</p>
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">אין עדכונים עדיין</p>
                  <p className="text-sm mt-1">המנטור שלך יפרסם עדכונים בקרוב</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post: { id: string; content: string; created_at: string; profiles: { full_name: string } | null }) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card rounded-xl card-shadow p-5"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                          {post.profiles?.full_name?.[0]?.toUpperCase() ?? 'M'}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{post.profiles?.full_name ?? 'מנטור'}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(post.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{post.content}</p>
                    </motion.div>
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
