import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, LayoutGrid, BookOpen, Users, Plus, Video, FileText,
  ChevronDown, ChevronRight, MoreVertical, Trash2, Edit2, Eye, EyeOff,
  LogOut, Send, X, Check, Film
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SidebarTab = 'lessons' | 'community';

interface Category {
  id: string;
  title: string;
  description: string | null;
  position: number;
}

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  lesson_type: string;
  video_url: string | null;
  category_id: string | null;
  is_published: boolean;
  duration_minutes: number | null;
}

export default function MentorDashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTab>('lessons');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showLessonPanel, setShowLessonPanel] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [lessonForm, setLessonForm] = useState({
    title: '', description: '', lesson_type: 'lesson', video_url: '', duration_minutes: '',
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('mentor_id', user!.id)
        .order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch lessons
  const { data: lessons = [] } = useQuery<Lesson[]>({
    queryKey: ['lessons', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('mentor_id', user!.id)
        .order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch community members
  const { data: members = [] } = useQuery<{ student_id: string; joined_at: string; profiles: { full_name: string; email: string } | null }[]>({
    queryKey: ['members', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_members')
        .select('student_id, joined_at')
        .eq('mentor_id', user!.id);
      if (error) throw error;
      // Enrich with profile data
      const enriched = await Promise.all(
        (data ?? []).map(async (m) => {
          const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('user_id', m.student_id).single();
          return { ...m, profiles: profile };
        })
      );
      return enriched;
    },
    enabled: !!user && activeTab === 'community',
  });

  // Fetch pending invites
  const { data: invites = [] } = useQuery({
    queryKey: ['invites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_invites')
        .select('*')
        .eq('mentor_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return data;
    },
    enabled: !!user && activeTab === 'community',
  });

  // Create category
  const createCategory = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from('categories').insert({
        mentor_id: user!.id,
        title,
        position: categories.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setNewCatTitle('');
      setShowCategoryForm(false);
      toast({ title: 'קטגוריה נוצרה', description: 'הקטגוריה החדשה נוספה בהצלחה.' });
    },
  });

  // Create lesson
  const createLesson = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lessons').insert({
        mentor_id: user!.id,
        category_id: selectedCategoryId,
        title: lessonForm.title,
        description: lessonForm.description || null,
        lesson_type: lessonForm.lesson_type,
        video_url: lessonForm.video_url || null,
        duration_minutes: lessonForm.duration_minutes ? parseInt(lessonForm.duration_minutes) : null,
        position: lessons.filter(l => l.category_id === selectedCategoryId).length,
        is_published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lessons'] });
      setShowLessonPanel(false);
      setLessonForm({ title: '', description: '', lesson_type: 'lesson', video_url: '', duration_minutes: '' });
      toast({ title: 'שיעור נוצר', description: 'השיעור נוסף בהצלחה.' });
    },
  });

  // Toggle publish
  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from('lessons').update({ is_published: !is_published }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });

  // Delete lesson
  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lessons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });

  // Delete category
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  // Send invite
  const sendInvite = useMutation({
    mutationFn: async (contact: string) => {
      const { error } = await supabase.from('community_invites').insert({
        mentor_id: user!.id,
        invited_by: user!.id,
        contact: contact.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setInviteContact('');
      toast({ title: 'הזמנה נשלחה', description: 'ברגע שהתלמיד יתחבר, הוא יקבל את ההזמנה.' });
    },
    onError: () => toast({ title: 'שגיאה', description: 'לא ניתן לשלוח הזמנה', variant: 'destructive' }),
  });

  const toggleCat = (id: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const typeIcon = (type: string) => {
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-blue-500" />;
    if (type === 'resource') return <FileText className="w-3.5 h-3.5 text-amber-500" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'zoom_recording') return 'הקלטת זום';
    if (type === 'resource') return 'חומר לימוד';
    return 'שיעור';
  };

  const uncategorized = lessons.filter(l => !l.category_id);

  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      {/* Right Sidebar */}
      <aside className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 h-full">
        {/* Brand */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-primary-foreground w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-sidebar-foreground">TradeLearn</div>
              <div className="text-xs text-muted-foreground">מנטור</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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

        {/* User footer */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{user?.email}</div>
            </div>
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="התנתק"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'lessons' && (
            <motion.div
              key="lessons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 max-w-4xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">שיעורים וקורסים</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {lessons.length} שיעורים · {categories.length} קטגוריות
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCategoryForm(true)}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    קטגוריה חדשה
                  </button>
                  <button
                    onClick={() => { setSelectedCategoryId(null); setShowLessonPanel(true); }}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-slate-800 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    צור שיעור חדש
                  </button>
                </div>
              </div>

              {/* Category form inline */}
              <AnimatePresence>
                {showCategoryForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 overflow-hidden"
                  >
                    <div className="bg-card rounded-xl card-shadow p-4 flex gap-2">
                      <input
                        autoFocus
                        value={newCatTitle}
                        onChange={e => setNewCatTitle(e.target.value)}
                        placeholder="שם הקטגוריה..."
                        className="flex-1 h-10 px-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                        onKeyDown={e => e.key === 'Enter' && newCatTitle.trim() && createCategory.mutate(newCatTitle)}
                      />
                      <button
                        onClick={() => newCatTitle.trim() && createCategory.mutate(newCatTitle)}
                        className="h-10 px-4 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-all"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setShowCategoryForm(false); setNewCatTitle(''); }}
                        className="h-10 px-3 rounded-lg text-muted-foreground hover:text-foreground transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Categories & Lessons */}
              <div className="space-y-3">
                {categories.map(cat => {
                  const catLessons = lessons.filter(l => l.category_id === cat.id);
                  const isExpanded = expandedCats.has(cat.id);
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
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {catLessons.length} שיעורים
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedCategoryId(cat.id); setShowLessonPanel(true); }}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent/10 text-accent transition-colors"
                          title="הוסף שיעור"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteCategory.mutate(cat.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                              {catLessons.length === 0 ? (
                                <div className="px-6 py-4 text-sm text-muted-foreground text-center">
                                  עדיין אין תכנים בקטגוריה זו.
                                </div>
                              ) : (
                                catLessons.map(lesson => (
                                  <LessonRow
                                    key={lesson.id}
                                    lesson={lesson}
                                    onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                                    onDelete={() => deleteLesson.mutate(lesson.id)}
                                    typeIcon={typeIcon}
                                    typeLabel={typeLabel}
                                  />
                                ))
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Uncategorized */}
                {uncategorized.length > 0 && (
                  <div className="bg-card rounded-xl card-shadow overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <span className="font-semibold text-muted-foreground flex-1 text-sm">ללא קטגוריה</span>
                    </div>
                    <div className="border-t border-border">
                      {uncategorized.map(lesson => (
                        <LessonRow
                          key={lesson.id}
                          lesson={lesson}
                          onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                          onDelete={() => deleteLesson.mutate(lesson.id)}
                          typeIcon={typeIcon}
                          typeLabel={typeLabel}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {categories.length === 0 && lessons.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין שיעורים עדיין</p>
                    <p className="text-sm mt-1">צור קטגוריה ושיעורים ראשונים</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div
              key="community"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 max-w-3xl"
            >
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">קהילה</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {members.length} תלמידים · {invites.length} הזמנות ממתינות
                </p>
              </div>

              {/* Invite input */}
              <div className="bg-card rounded-xl card-shadow p-6 mb-6">
                <h2 className="font-semibold text-foreground mb-1">הזמן תלמיד לקהילה</h2>
                <p className="text-sm text-muted-foreground mb-4">הכנס אימייל או טלפון של התלמיד</p>
                <div className="flex gap-2">
                  <input
                    value={inviteContact}
                    onChange={e => setInviteContact(e.target.value)}
                    placeholder="אימייל@example.com או 050-0000000"
                    className="flex-1 h-11 px-4 bg-surface border-none ring-1 ring-slate-200 rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    onKeyDown={e => e.key === 'Enter' && inviteContact.trim() && sendInvite.mutate(inviteContact)}
                  />
                  <button
                    onClick={() => inviteContact.trim() && sendInvite.mutate(inviteContact)}
                    disabled={!inviteContact.trim() || sendInvite.isPending}
                    className="h-11 px-6 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    שלח הזמנה
                  </button>
                </div>
              </div>

              {/* Pending invites */}
              {invites.length > 0 && (
                <div className="bg-card rounded-xl card-shadow p-6 mb-6">
                  <h2 className="font-semibold text-foreground mb-3">הזמנות ממתינות</h2>
                  <div className="space-y-2">
                    {invites.map((inv: { id: string; contact: string; created_at: string }) => (
                      <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                          <Send className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <span className="text-sm text-foreground flex-1">{inv.contact}</span>
                        <span className="text-xs text-muted-foreground">ממתין לאישור</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Members list */}
              <div className="bg-card rounded-xl card-shadow p-6">
                <h2 className="font-semibold text-foreground mb-3">תלמידים בקהילה</h2>
                {members.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">אין תלמידים בקהילה עדיין. שלח הזמנות!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m: { student_id: string; joined_at: string; profiles: { full_name: string; email: string } | null }) => (
                      <div key={m.student_id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                          {m.profiles?.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{m.profiles?.full_name ?? 'תלמיד'}</div>
                          <div className="text-xs text-muted-foreground">{m.profiles?.email}</div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          הצטרף {new Date(m.joined_at).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Lesson slide panel */}
      <AnimatePresence>
        {showLessonPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setShowLessonPanel(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[420px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">שיעור חדש</h2>
                  <button onClick={() => setShowLessonPanel(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">כותרת השיעור *</label>
                    <input
                      value={lessonForm.title}
                      onChange={e => setLessonForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="לדוגמה: מבוא לניתוח טכני"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">סוג תוכן</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'lesson', label: 'שיעור', icon: Video },
                        { key: 'zoom_recording', label: 'הקלטת זום', icon: Film },
                        { key: 'resource', label: 'חומר לימוד', icon: FileText },
                      ].map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setLessonForm(f => ({ ...f, lesson_type: key }))}
                          className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                            lessonForm.lesson_type === key
                              ? 'border-accent bg-accent/5 text-accent'
                              : 'border-border text-muted-foreground hover:border-foreground/20'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">קטגוריה</label>
                    <select
                      value={selectedCategoryId ?? ''}
                      onChange={e => setSelectedCategoryId(e.target.value || null)}
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    >
                      <option value="">ללא קטגוריה</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">קישור לוידאו</label>
                    <input
                      value={lessonForm.video_url}
                      onChange={e => setLessonForm(f => ({ ...f, video_url: e.target.value }))}
                      placeholder="https://youtube.com/..."
                      dir="ltr"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-left"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">משך (דקות)</label>
                    <input
                      type="number"
                      value={lessonForm.duration_minutes}
                      onChange={e => setLessonForm(f => ({ ...f, duration_minutes: e.target.value }))}
                      placeholder="45"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">תיאור</label>
                    <textarea
                      value={lessonForm.description}
                      onChange={e => setLessonForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder="תיאור קצר של השיעור..."
                      className="w-full px-4 py-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right resize-none"
                    />
                  </div>

                  <button
                    onClick={() => lessonForm.title.trim() && createLesson.mutate()}
                    disabled={!lessonForm.title.trim() || createLesson.isPending}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    {createLesson.isPending ? 'שומר...' : 'צור שיעור'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function LessonRow({
  lesson,
  onTogglePublish,
  onDelete,
  typeIcon,
  typeLabel,
}: {
  lesson: Lesson;
  onTogglePublish: () => void;
  onDelete: () => void;
  typeIcon: (t: string) => React.ReactNode;
  typeLabel: (t: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors group">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {typeIcon(lesson.lesson_type)}
        <span className="text-sm text-foreground truncate">{lesson.title}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {typeLabel(lesson.lesson_type)}
        </span>
        {lesson.duration_minutes && (
          <span className="text-xs text-muted-foreground tabular shrink-0">{lesson.duration_minutes} דק'</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePublish}
          className={`h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
            lesson.is_published
              ? 'bg-accent/10 text-accent hover:bg-accent/20'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          title={lesson.is_published ? 'הסתר מתלמידים' : 'פרסם לתלמידים'}
        >
          {lesson.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {lesson.is_published ? 'פורסם' : 'טיוטה'}
        </button>
        <button
          onClick={onDelete}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
