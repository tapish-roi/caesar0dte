import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, LayoutGrid, BookOpen, Users, Plus, Video, FileText,
  ChevronDown, Trash2, Eye, EyeOff,
  LogOut, Send, X, Check, Film, Upload, GraduationCap,
  Image, Radio, MessageSquare, MessageCircle, Wifi, Pin, PinOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type SidebarTab = 'lessons' | 'community' | 'students';
type PostType = 'discussion' | 'media' | 'live';

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

interface CommunityPost {
  id: string;
  content: string;
  post_type: string;
  media_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  mentor_id: string;
  created_at: string;
}

interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string } | null;
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
  const [isUploading, setIsUploading] = useState(false);
  const [isPostUploading, setIsPostUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '', description: '', lesson_type: 'recorded_lesson', video_url: '', duration_minutes: '',
  });

  // Post compose state
  const [postType, setPostType] = useState<PostType>('discussion');
  const [postContent, setPostContent] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postMediaType, setPostMediaType] = useState('');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('mentor_id', user!.id).order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: lessons = [] } = useQuery<Lesson[]>({
    queryKey: ['lessons', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('lessons').select('*').eq('mentor_id', user!.id).order('position');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: members = [] } = useQuery<{ student_id: string; joined_at: string; profiles: { full_name: string; email: string } | null }[]>({
    queryKey: ['members', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('community_members').select('student_id, joined_at').eq('mentor_id', user!.id);
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (m) => {
          const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('user_id', m.student_id).single();
          return { ...m, profiles: profile };
        })
      );
      return enriched;
    },
    enabled: !!user && activeTab === 'students',
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('community_invites').select('*').eq('mentor_id', user!.id).eq('status', 'pending');
      if (error) throw error;
      return data;
    },
    enabled: !!user && activeTab === 'students',
  });

  // Community posts — pinned first, then newest
  const { data: posts = [] } = useQuery<CommunityPost[]>({
    queryKey: ['community_posts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('mentor_id', user!.id)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CommunityPost[];
    },
    enabled: !!user && activeTab === 'community',
  });

  // ─── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || activeTab !== 'community') return;

    const channel = supabase
      .channel(`mentor-community-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_posts',
        filter: `mentor_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['community_posts', user.id] });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_post_comments',
      }, (payload) => {
        const postId = (payload.new as { post_id?: string })?.post_id || (payload.old as { post_id?: string })?.post_id;
        if (postId) qc.invalidateQueries({ queryKey: ['comments', postId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, activeTab, qc]);

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createCategory = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from('categories').insert({ mentor_id: user!.id, title, position: categories.length });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setNewCatTitle(''); setShowCategoryForm(false);
      toast({ title: 'קטגוריה נוצרה' });
    },
  });

  const handleFileUpload = async (file: File): Promise<string> => {
    setIsUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return publicUrl;
  };

  const handlePostFileUpload = async (file: File): Promise<{ url: string; type: string }> => {
    setIsPostUploading(true);
    const ext = file.name.split('.').pop();
    const path = `posts/${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsPostUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return { url: publicUrl, type: file.type.startsWith('video') ? 'video' : 'image' };
  };

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
      setLessonForm({ title: '', description: '', lesson_type: 'recorded_lesson', video_url: '', duration_minutes: '' });
      toast({ title: 'שיעור נוצר' });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from('lessons').update({ is_published: !is_published }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lessons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const sendInvite = useMutation({
    mutationFn: async (contact: string) => {
      const { error } = await supabase.from('community_invites').insert({ mentor_id: user!.id, invited_by: user!.id, contact: contact.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setInviteContact('');
      toast({ title: 'הזמנה נשלחה' });
    },
    onError: () => toast({ title: 'שגיאה', description: 'לא ניתן לשלוח הזמנה', variant: 'destructive' }),
  });

  const createPost = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('community_posts').insert({
        mentor_id: user!.id,
        content: postContent,
        post_type: postType,
        media_url: postMediaUrl || null,
        media_type: postMediaType || null,
        is_pinned: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_posts'] });
      setPostContent(''); setPostMediaUrl(''); setPostMediaType(''); setPostType('discussion');
      toast({ title: 'פוסט פורסם!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום', variant: 'destructive' }),
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('community_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community_posts'] }),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const { error } = await supabase.from('community_posts').update({ is_pinned: !is_pinned }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_posts'] });
      toast({ title: 'עודכן' });
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      const { error } = await supabase.from('community_post_comments').insert({ post_id: postId, author_id: user!.id, content });
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
    },
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const fetchComments = async (postId: string): Promise<PostComment[]> => {
    const { data, error } = await supabase.from('community_post_comments').select('*').eq('post_id', postId).order('created_at');
    if (error) throw error;
    const enriched = await Promise.all(
      (data ?? []).map(async (c) => {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', c.author_id).single();
        return { ...c, profiles: profile };
      })
    );
    return enriched;
  };

  const toggleCat = (id: string) => {
    setExpandedCats(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => { const next = new Set(prev); next.has(postId) ? next.delete(postId) : next.add(postId); return next; });
  };

  const typeIcon = (type: string) => {
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-blue-500" />;
    if (type === 'presentation') return <FileText className="w-3.5 h-3.5 text-amber-500" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'zoom_recording') return 'הקלטת זום';
    if (type === 'presentation') return 'מצגת';
    return 'שיעור מוקלט';
  };

  const lessonTypes = [
    { key: 'recorded_lesson', label: 'שיעור מוקלט', icon: Video },
    { key: 'zoom_recording', label: 'הקלטת זום', icon: Film },
    { key: 'presentation', label: 'מצגות', icon: FileText },
  ];

  const postTypeOptions: { key: PostType; label: string; icon: typeof MessageSquare }[] = [
    { key: 'discussion', label: 'דיון', icon: MessageSquare },
    { key: 'media', label: 'תמונה/וידאו', icon: Image },
    { key: 'live', label: 'לייב', icon: Radio },
  ];

  const postTypeBg: Record<string, string> = { discussion: 'bg-blue-500/10', media: 'bg-emerald-500/10', live: 'bg-red-500/10' };
  const postTypeColor: Record<string, string> = { discussion: 'text-blue-500', media: 'text-emerald-500', live: 'text-red-500' };
  const postTypeLabel: Record<string, string> = { discussion: 'דיון', media: 'מדיה', live: 'לייב' };
  const postTypeIcon = (type: string) => {
    if (type === 'live') return <Wifi className="w-3.5 h-3.5" />;
    if (type === 'media') return <Image className="w-3.5 h-3.5" />;
    return <MessageCircle className="w-3.5 h-3.5" />;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const isPresentation = lessonForm.lesson_type === 'presentation';
  const uncategorized = lessons.filter(l => !l.category_id);

  // ─── Render ─────────────────────────────────────────────────────────────────

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
              <div className="text-xs text-muted-foreground">מנטור</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {([
            { key: 'lessons', label: 'שיעורים', icon: BookOpen },
            { key: 'community', label: 'קהילה', icon: Users },
            { key: 'students', label: 'תלמידים', icon: GraduationCap },
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
        <AnimatePresence mode="wait">

          {/* ──────── LESSONS ──────── */}
          {activeTab === 'lessons' && (
            <motion.div key="lessons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 max-w-4xl">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">שיעורים וקורסים</h1>
                  <p className="text-sm text-muted-foreground mt-1">{lessons.length} שיעורים · {categories.length} קטגוריות</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCategoryForm(true)}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
                  >
                    <LayoutGrid className="w-4 h-4" />קטגוריה חדשה
                  </button>
                  <button
                    onClick={() => { setSelectedCategoryId(null); setShowLessonPanel(true); }}
                    className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
                  >
                    <Plus className="w-4 h-4" />צור שיעור חדש
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showCategoryForm && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
                    <div className="bg-card rounded-xl card-shadow p-4 flex gap-2">
                      <input
                        autoFocus value={newCatTitle} onChange={e => setNewCatTitle(e.target.value)}
                        placeholder="שם הקטגוריה..."
                        className="flex-1 h-10 px-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                        onKeyDown={e => e.key === 'Enter' && newCatTitle.trim() && createCategory.mutate(newCatTitle)}
                      />
                      <button onClick={() => newCatTitle.trim() && createCategory.mutate(newCatTitle)} className="h-10 px-4 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:opacity-90">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setShowCategoryForm(false); setNewCatTitle(''); }} className="h-10 px-3 rounded-lg text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {categories.map(cat => {
                  const catLessons = lessons.filter(l => l.category_id === cat.id);
                  const isExpanded = expandedCats.has(cat.id);
                  return (
                    <div key={cat.id} className="bg-card rounded-xl card-shadow overflow-hidden">
                      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleCat(cat.id)}>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        <span className="font-semibold text-foreground flex-1">{cat.title}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{catLessons.length} שיעורים</span>
                        <button onClick={e => { e.stopPropagation(); setSelectedCategoryId(cat.id); setShowLessonPanel(true); }} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent/10 text-accent transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteCategory.mutate(cat.id); }} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="border-t border-border">
                              {catLessons.length === 0 ? (
                                <div className="px-6 py-4 text-sm text-muted-foreground text-center">עדיין אין תכנים בקטגוריה זו.</div>
                              ) : catLessons.map(lesson => (
                                <LessonRow key={lesson.id} lesson={lesson}
                                  onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                                  onDelete={() => deleteLesson.mutate(lesson.id)}
                                  typeIcon={typeIcon} typeLabel={typeLabel}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {uncategorized.length > 0 && (
                  <div className="bg-card rounded-xl card-shadow overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <span className="font-semibold text-muted-foreground flex-1 text-sm">ללא קטגוריה</span>
                    </div>
                    <div className="border-t border-border">
                      {uncategorized.map(lesson => (
                        <LessonRow key={lesson.id} lesson={lesson}
                          onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                          onDelete={() => deleteLesson.mutate(lesson.id)}
                          typeIcon={typeIcon} typeLabel={typeLabel}
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

          {/* ──────── COMMUNITY ──────── */}
          {activeTab === 'community' && (
            <motion.div key="community" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 max-w-2xl">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">קהילה</h1>
                <p className="text-sm text-muted-foreground mt-1">שתף עדכונים, ניתוחים ודיונים עם הקהילה שלך</p>
              </div>

              {/* Compose box */}
              <div className="bg-card rounded-2xl card-shadow p-5 mb-6">
                <div className="flex gap-2 mb-4">
                  {postTypeOptions.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => { setPostType(key); setPostMediaUrl(''); setPostMediaType(''); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        postType === key
                          ? `${postTypeBg[key]} ${postTypeColor[key]} border-current`
                          : 'border-border text-muted-foreground hover:border-foreground/20'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={postContent}
                  onChange={e => setPostContent(e.target.value)}
                  placeholder={
                    postType === 'live' ? 'תאר את הסשן: מה אתה מסחר היום, אסטרטגיה, זמן...'
                    : postType === 'media' ? 'תאר את התמונה/סרטון שאתה מעלה...'
                    : 'שתף ניתוח, שאלה לדיון, או עדכון לקהילה...'
                  }
                  rows={3}
                  className="w-full px-4 py-3 bg-surface border-none ring-1 ring-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right resize-none"
                />

                {postType === 'media' && (
                  <div className="mt-3">
                    <input
                      ref={postFileInputRef} type="file" accept="image/*,video/*" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { url, type } = await handlePostFileUpload(file);
                          setPostMediaUrl(url); setPostMediaType(type);
                          toast({ title: 'הקובץ הועלה בהצלחה' });
                        } catch { toast({ title: 'שגיאה בהעלאה', variant: 'destructive' }); }
                      }}
                    />
                    {postMediaUrl ? (
                      <div className="relative rounded-xl overflow-hidden">
                        {postMediaType === 'video'
                          ? <video src={postMediaUrl} className="w-full max-h-64 object-cover rounded-xl" controls />
                          : <img src={postMediaUrl} alt="preview" className="w-full max-h-64 object-cover rounded-xl" />
                        }
                        <button
                          onClick={() => { setPostMediaUrl(''); setPostMediaType(''); if (postFileInputRef.current) postFileInputRef.current.value = ''; }}
                          className="absolute top-2 left-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => postFileInputRef.current?.click()} disabled={isPostUploading}
                        className="w-full h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-50 text-sm"
                      >
                        {isPostUploading
                          ? <><div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span>מעלה...</span></>
                          : <><Upload className="w-4 h-4" /><span>העלה תמונה או וידאו</span></>
                        }
                      </button>
                    )}
                  </div>
                )}

                {postType === 'live' && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg text-red-500 text-xs font-medium w-fit">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    LIVE — יצורף לפוסט כאשר יפורסם
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => postContent.trim() && createPost.mutate()}
                    disabled={!postContent.trim() || createPost.isPending || isPostUploading}
                    className="flex items-center gap-2 h-9 px-5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />{createPost.isPending ? 'מפרסם...' : 'פרסם'}
                  </button>
                </div>
              </div>

              {/* Feed */}
              <div className="space-y-4">
                {posts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין פוסטים עדיין</p>
                    <p className="text-sm mt-1">פרסם את הפוסט הראשון שלך לקהילה</p>
                  </div>
                ) : posts.map(post => (
                  <MentorPostCard
                    key={post.id}
                    post={post}
                    fetchComments={fetchComments}
                    expanded={expandedComments.has(post.id)}
                    onToggleComments={() => toggleComments(post.id)}
                    commentText={commentTexts[post.id] ?? ''}
                    onCommentChange={(val) => setCommentTexts(prev => ({ ...prev, [post.id]: val }))}
                    onAddComment={() => { const t = commentTexts[post.id]?.trim(); if (t) addComment.mutate({ postId: post.id, content: t }); }}
                    onDelete={() => deletePost.mutate(post.id)}
                    onTogglePin={() => togglePin.mutate({ id: post.id, is_pinned: post.is_pinned })}
                    postTypeLabel={postTypeLabel}
                    postTypeIcon={postTypeIcon}
                    postTypeBg={postTypeBg}
                    postTypeColor={postTypeColor}
                    formatDate={formatDate}
                    queryClient={qc}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ──────── STUDENTS ──────── */}
          {activeTab === 'students' && (
            <motion.div key="students" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 max-w-3xl">
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">תלמידים</h1>
                <p className="text-sm text-muted-foreground mt-1">{members.length} תלמידים רשומים</p>
              </div>

              <div className="bg-card rounded-xl card-shadow p-6 mb-6">
                <h2 className="font-semibold text-foreground mb-1">הזמן תלמיד לקהילה</h2>
                <p className="text-sm text-muted-foreground mb-4">הכנס אימייל או טלפון של התלמיד</p>
                <div className="flex gap-2">
                  <input
                    value={inviteContact} onChange={e => setInviteContact(e.target.value)}
                    placeholder="אימייל@example.com או 050-0000000"
                    className="flex-1 h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    onKeyDown={e => e.key === 'Enter' && inviteContact.trim() && sendInvite.mutate(inviteContact)}
                  />
                  <button
                    onClick={() => inviteContact.trim() && sendInvite.mutate(inviteContact)}
                    disabled={!inviteContact.trim() || sendInvite.isPending}
                    className="h-11 px-6 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />שלח הזמנה
                  </button>
                </div>
              </div>

              {invites.length > 0 && (
                <div className="bg-card rounded-xl card-shadow p-6 mb-6">
                  <h2 className="font-semibold text-foreground mb-3">הזמנות ממתינות</h2>
                  <div className="space-y-2">
                    {invites.map((inv: { id: string; contact: string }) => (
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

              <div className="bg-card rounded-xl card-shadow p-6">
                <h2 className="font-semibold text-foreground mb-3">תלמידים בקהילה</h2>
                {members.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין תלמידים עדיין</p>
                    <p className="text-sm mt-1">הזמן תלמידים באמצעות הטופס למעלה</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {members.map((m) => (
                      <div key={m.student_id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                          {m.profiles?.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-foreground">{m.profiles?.full_name ?? 'תלמיד'}</div>
                          <div className="text-xs text-muted-foreground">{m.profiles?.email}</div>
                        </div>
                        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                          הצטרף {new Date(m.joined_at).toLocaleDateString('he-IL')}
                        </div>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowLessonPanel(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[420px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">שיעור חדש</h2>
                  <button onClick={() => setShowLessonPanel(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">כותרת השיעור *</label>
                    <input
                      value={lessonForm.title} onChange={e => setLessonForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="לדוגמה: מבוא לניתוח טכני"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">סוג תוכן</label>
                    <div className="grid grid-cols-3 gap-2">
                      {lessonTypes.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => setLessonForm(f => ({ ...f, lesson_type: key, video_url: '' }))}
                          className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                            lessonForm.lesson_type === key ? 'border-accent bg-accent/5 text-accent' : 'border-border text-muted-foreground hover:border-foreground/20'
                          }`}
                        >
                          <Icon className="w-4 h-4" />{label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {isPresentation ? 'העלאת מצגת / וידאו' : 'העלאת וידאו'}
                    </label>
                    <input
                      ref={fileInputRef} type="file" accept={isPresentation ? 'video/*,.pdf,.ppt,.pptx' : 'video/*'} className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await handleFileUpload(file);
                          setLessonForm(f => ({ ...f, video_url: url }));
                          toast({ title: 'הקובץ הועלה בהצלחה' });
                        } catch { toast({ title: 'שגיאה בהעלאה', variant: 'destructive' }); }
                      }}
                    />
                    {lessonForm.video_url ? (
                      <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                        <Check className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-xs text-accent flex-1 truncate">הקובץ הועלה בהצלחה</span>
                        <button onClick={() => { setLessonForm(f => ({ ...f, video_url: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                        className="w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                      >
                        {isUploading
                          ? <><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span className="text-xs">מעלה...</span></>
                          : <>
                            <Upload className="w-5 h-5" />
                            <span className="text-xs font-medium">{isPresentation ? 'לחץ להעלאת מצגת או וידאו' : 'לחץ להעלאת וידאו'}</span>
                            <span className="text-xs opacity-60">{isPresentation ? 'MP4, PDF, PPT, PPTX' : 'MP4, MOV, AVI'}</span>
                          </>
                        }
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">קטגוריה</label>
                    <select value={selectedCategoryId ?? ''} onChange={e => setSelectedCategoryId(e.target.value || null)}
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    >
                      <option value="">ללא קטגוריה</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">משך (דקות)</label>
                    <input type="number" value={lessonForm.duration_minutes} onChange={e => setLessonForm(f => ({ ...f, duration_minutes: e.target.value }))}
                      placeholder="45"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">תיאור</label>
                    <textarea value={lessonForm.description} onChange={e => setLessonForm(f => ({ ...f, description: e.target.value }))} rows={3}
                      placeholder="תיאור קצר של השיעור..."
                      className="w-full px-4 py-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right resize-none"
                    />
                  </div>

                  <button
                    onClick={() => lessonForm.title.trim() && createLesson.mutate()}
                    disabled={!lessonForm.title.trim() || createLesson.isPending || isUploading}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
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

// ─── MentorPostCard ───────────────────────────────────────────────────────────
function MentorPostCard({
  post, fetchComments, expanded, onToggleComments,
  commentText, onCommentChange, onAddComment, onDelete, onTogglePin,
  postTypeLabel, postTypeIcon, postTypeBg, postTypeColor, formatDate, queryClient,
}: {
  post: CommunityPost;
  fetchComments: (id: string) => Promise<PostComment[]>;
  expanded: boolean;
  onToggleComments: () => void;
  commentText: string;
  onCommentChange: (v: string) => void;
  onAddComment: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  postTypeLabel: Record<string, string>;
  postTypeIcon: (t: string) => React.ReactNode;
  postTypeBg: Record<string, string>;
  postTypeColor: Record<string, string>;
  formatDate: (s: string) => string;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data: comments = [], isLoading: commentsLoading } = useQuery<PostComment[]>({
    queryKey: ['comments', post.id],
    queryFn: () => fetchComments(post.id),
    enabled: expanded,
  });

  const pType = post.post_type;

  return (
    <div className={`bg-card rounded-2xl card-shadow overflow-hidden ${post.is_pinned ? 'ring-2 ring-primary/25' : ''}`}>
      <div className="p-5">
        {post.is_pinned && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-2">
            <Pin className="w-3 h-3" />נעוץ
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${postTypeBg[pType] ?? 'bg-muted'} ${postTypeColor[pType] ?? 'text-foreground'}`}>
              {pType === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              {postTypeIcon(pType)}
              {postTypeLabel[pType] ?? pType}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onTogglePin}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                post.is_pinned ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
              title={post.is_pinned ? 'בטל נעיצה' : 'נעץ פוסט'}
            >
              {post.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {post.media_url && (
          <div className="mt-3 rounded-xl overflow-hidden">
            {post.media_type === 'video'
              ? <video src={post.media_url} className="w-full max-h-72 object-cover rounded-xl" controls />
              : <img src={post.media_url} alt="post" className="w-full max-h-72 object-cover rounded-xl" />
            }
          </div>
        )}

        <button onClick={onToggleComments} className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle className="w-3.5 h-3.5" />
          {expanded ? 'הסתר תגובות' : `תגובות${comments.length > 0 ? ` (${comments.length})` : ''}`}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-5 pb-4 pt-3">
              {commentsLoading ? (
                <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">אין תגובות עדיין</p>
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
              <div className="flex gap-2 mt-2">
                <textarea
                  value={commentText} onChange={e => onCommentChange(e.target.value)}
                  placeholder="כתוב תגובה..." rows={1}
                  className="flex-1 px-3 py-2 bg-surface border-none ring-1 ring-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right resize-none"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(); } }}
                />
                <button onClick={onAddComment} disabled={!commentText.trim()}
                  className="w-9 h-9 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── LessonRow ────────────────────────────────────────────────────────────────
function LessonRow({ lesson, onTogglePublish, onDelete, typeIcon, typeLabel }: {
  lesson: Lesson;
  onTogglePublish: () => void;
  onDelete: () => void;
  typeIcon: (t: string) => React.ReactNode;
  typeLabel: (t: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors group">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {typeIcon(lesson.lesson_type)}
        <span className="text-sm text-foreground truncate">{lesson.title}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{typeLabel(lesson.lesson_type)}</span>
        {lesson.duration_minutes && <span className="text-xs text-muted-foreground tabular shrink-0">{lesson.duration_minutes} דק'</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onTogglePublish}
          className={`h-7 px-2 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
            lesson.is_published ? 'bg-accent/10 text-accent hover:bg-accent/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {lesson.is_published ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          {lesson.is_published ? 'פורסם' : 'טיוטה'}
        </button>
        <button onClick={onDelete} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
