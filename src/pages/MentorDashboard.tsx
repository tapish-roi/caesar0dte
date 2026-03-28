import { useState, useRef, useEffect, useCallback } from 'react';
import MediaLightbox, { useMediaLightbox } from '@/components/MediaLightbox';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, LayoutGrid, BookOpen, Users, Plus, Video, FileText,
  ChevronDown, Trash2, Eye, EyeOff,
  LogOut, Send, X, Check, Film, Upload, GraduationCap,
  Image, MessageSquare, MessageCircle, Pin, PinOff,
  ShieldCheck, Lock, Unlock, Paperclip, Pencil, GripVertical, Radio,
  MessageCircleQuestion, ClipboardList, List, AlignLeft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AttachmentViewer from '@/components/AttachmentViewer';
import LiveHubMentor from '@/components/LiveHubMentor';
import MentorQuestionsHub from '@/components/MentorQuestionsHub';
import MentorQuizzesHub from '@/components/MentorQuizzesHub';
import LessonQA from '@/components/LessonQA';
import LessonStudentProgress from '@/components/LessonStudentProgress';

// ── LessonQuizPanel: shows the published quiz for a lesson ──────────────────
function LessonQuizPanel({ lessonId, mentorId, onCreateQuiz }: { lessonId: string; mentorId: string; onCreateQuiz: () => void }) {
  const { data: quiz, isLoading } = useQuery({
    queryKey: ['lesson-quiz-panel', lessonId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quizzes')
        .select('id, title, description, is_published')
        .eq('mentor_id', mentorId)
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ['lesson-quiz-questions', quiz?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_questions')
        .select('id, question_text, question_type, position')
        .eq('quiz_id', quiz!.id)
        .order('position');
      return data ?? [];
    },
    enabled: !!quiz?.id,
  });

  const { data: options = [] } = useQuery({
    queryKey: ['lesson-quiz-options', quiz?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_question_options')
        .select('id, question_id, option_text, is_correct, position')
        .in('question_id', questions.map(q => q.id))
        .order('position');
      return data ?? [];
    },
    enabled: questions.length > 0,
  });

  if (isLoading) return (
    <div className="w-80 shrink-0 bg-card border border-border rounded-xl p-5 flex items-center justify-center min-h-[200px]">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!quiz) return (
    <div className="w-80 shrink-0 bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[200px] text-center" dir="rtl">
      <ClipboardList className="w-8 h-8 text-muted-foreground opacity-30" />
      <p className="text-sm font-medium text-foreground">אין מבחן לשיעור זה</p>
      <p className="text-xs text-muted-foreground">צור מבחן כדי לבחון את התלמידים</p>
      <button
        onClick={onCreateQuiz}
        className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all mt-1"
      >
        <Plus className="w-3.5 h-3.5" />צור מבחן
      </button>
    </div>
  );

  return (
    <div className="w-80 shrink-0 bg-card border border-border rounded-xl overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${quiz.is_published ? 'bg-accent/10' : 'bg-muted'}`}>
          <ClipboardList className={`w-4 h-4 ${quiz.is_published ? 'text-accent' : 'text-muted-foreground'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{quiz.title}</p>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${quiz.is_published ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
            {quiz.is_published ? 'פורסם' : 'טיוטה'}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{questions.length} שאלות</span>
      </div>
      {/* Questions list */}
      <div className="overflow-y-auto max-h-[420px]">
        {questions.map((q, idx) => {
          const qOptions = options.filter(o => o.question_id === q.id);
          return (
            <div key={q.id} className="px-4 py-3 border-b border-border/50 last:border-0">
              <div className="flex items-start gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
                <p className="text-xs font-medium text-foreground leading-snug">{q.question_text}</p>
              </div>
              {q.question_type === 'multiple_choice' ? (
                <div className="space-y-1 me-7">
                  {qOptions.map((opt, oIdx) => (
                    <div key={opt.id} className={`flex items-center gap-2 px-2 py-1 rounded-md text-[11px] ${opt.is_correct ? 'bg-accent/10 text-accent font-medium' : 'text-muted-foreground'}`}>
                      <span className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 text-[9px] font-bold border-current">
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      {opt.option_text}
                      {opt.is_correct && <Check className="w-3 h-3 mr-auto shrink-0" />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mr-7 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <AlignLeft className="w-3 h-3 shrink-0" />שאלה פתוחה
                </div>
              )}
            </div>
          );
        })}
        {questions.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">אין שאלות במבחן</div>
        )}
      </div>
      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/20">
        <button
          onClick={onCreateQuiz}
          className="w-full flex items-center justify-center gap-2 h-8 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-all"
        >
          <ClipboardList className="w-3.5 h-3.5" />נהל מבחנים
        </button>
      </div>
    </div>
  );
}

type SidebarTab = 'lessons' | 'community' | 'students' | 'live' | 'questions' | 'quizzes';
type PostType = 'discussion' | 'media';
type LessonViewMode = { categoryId: string; categoryTitle: string } | null;

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
  attachment_url: string | null;
  attachment_name: string | null;
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
  const [quizNavLessonId, setQuizNavLessonId] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showLessonPanel, setShowLessonPanel] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [lessonViewMode, setLessonViewMode] = useState<LessonViewMode>(null);
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false);
  const [isPostUploading, setIsPostUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '', description: '', lesson_type: 'recorded_lesson', video_url: '', duration_minutes: '',
    attachment_url: '', attachment_name: '',
  });

  // Post compose state
  const [postType, setPostType] = useState<PostType>('discussion');
  const [postContent, setPostContent] = useState('');
  const [postMediaUrl, setPostMediaUrl] = useState('');
  const [postMediaType, setPostMediaType] = useState('');
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [removeConfirm, setRemoveConfirm] = useState<{ studentId: string; name: string } | null>(null);
  // Edit post state
  const [editPost, setEditPost] = useState<CommunityPost | null>(null);
  const [editPostContent, setEditPostContent] = useState('');
  const [editPostMediaUrl, setEditPostMediaUrl] = useState('');
  const [editPostMediaType, setEditPostMediaType] = useState('');
  const [isEditPostUploading, setIsEditPostUploading] = useState(false);
  const editPostFileInputRef = useRef<HTMLInputElement>(null);

  // Category access panel
  const [accessStudentId, setAccessStudentId] = useState<string | null>(null);
  const [accessStudentName, setAccessStudentName] = useState('');

  // Edit nickname
  const [editingNickname, setEditingNickname] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState('');

  // Edit lesson
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', video_url: '', duration_minutes: '', attachment_url: '', attachment_name: '' });
  const [isEditVideoUploading, setIsEditVideoUploading] = useState(false);
  const [isEditAttachmentUploading, setIsEditAttachmentUploading] = useState(false);
  const editVideoInputRef = useRef<HTMLInputElement>(null);
  const editAttachmentInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop
  const [dragLesson, setDragLesson] = useState<string | null>(null);
  const [dragOverLesson, setDragOverLesson] = useState<string | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: mentorProfile } = useQuery({
    queryKey: ['mentor-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

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
      return data as Lesson[];
    },
    enabled: !!user,
  });

  // Unanswered questions count for sidebar badge
  const { data: unansweredCount = 0 } = useQuery<number>({
    queryKey: ['unanswered-questions-count', user?.id],
    queryFn: async () => {
      const [{ count: privateCount }, { data: lessonQs }] = await Promise.all([
        supabase.from('private_questions').select('*', { count: 'exact', head: true }).eq('mentor_id', user!.id).is('answer', null),
        supabase.from('lesson_questions').select('id').eq('mentor_id', user!.id),
      ]);
      const lessonIds = (lessonQs ?? []).map(q => q.id);
      let unansweredLesson = 0;
      if (lessonIds.length > 0) {
        const { data: answers } = await supabase.from('lesson_question_answers').select('question_id').in('question_id', lessonIds);
        const answeredIds = new Set((answers ?? []).map(a => a.question_id));
        unansweredLesson = lessonIds.filter(id => !answeredIds.has(id)).length;
      }
      return (privateCount ?? 0) + unansweredLesson;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: members = [] } = useQuery<{ student_id: string; joined_at: string; display_name: string | null; profiles: { full_name: string; email: string } | null }[]>({
    queryKey: ['members', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('community_members').select('student_id, joined_at, display_name').eq('mentor_id', user!.id);
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

  const { data: invites = [] } = useQuery<{ id: string; contact: string; created_at: string }[]>({
    queryKey: ['invites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('community_invites').select('id, contact, created_at').eq('mentor_id', user!.id).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && activeTab === 'students',
  });

  // Access grants for the selected student
  const { data: accessGrants = [] } = useQuery<{ category_id: string }[]>({
    queryKey: ['access-grants', user?.id, accessStudentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_category_access')
        .select('category_id')
        .eq('mentor_id', user!.id)
        .eq('student_id', accessStudentId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!accessStudentId,
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

  const handleAttachmentUpload = async (file: File): Promise<{ url: string; name: string }> => {
    setIsAttachmentUploading(true);
    const ext = file.name.split('.').pop();
    const path = `attachments/${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsAttachmentUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return { url: publicUrl, name: file.name };
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
        attachment_url: lessonForm.attachment_url || null,
        attachment_name: lessonForm.attachment_name || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lessons'] });
      setShowLessonPanel(false);
      setLessonForm({ title: '', description: '', lesson_type: 'recorded_lesson', video_url: '', duration_minutes: '', attachment_url: '', attachment_name: '' });
      toast({ title: 'שיעור נוצר' });
    },
  });

  const updateLesson = useMutation({
    mutationFn: async () => {
      if (!editLesson) return;
      const { error } = await supabase.from('lessons').update({
        title: editForm.title,
        description: editForm.description || null,
        video_url: editForm.video_url || null,
        duration_minutes: editForm.duration_minutes ? parseInt(editForm.duration_minutes) : null,
        attachment_url: editForm.attachment_url || null,
        attachment_name: editForm.attachment_name || null,
      }).eq('id', editLesson.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lessons'] });
      setEditLesson(null);
      toast({ title: 'שיעור עודכן בהצלחה' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון השיעור', variant: 'destructive' }),
  });

  const handleEditVideoUpload = async (file: File): Promise<string> => {
    setIsEditVideoUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsEditVideoUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return publicUrl;
  };

  const handleEditAttachmentUpload = async (file: File): Promise<{ url: string; name: string }> => {
    setIsEditAttachmentUploading(true);
    const ext = file.name.split('.').pop();
    const path = `attachments/${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsEditAttachmentUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return { url: publicUrl, name: file.name };
  };

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

  const reorderLessons = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from('lessons').update({ position: idx }).eq('id', id)
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lessons'] }),
  });

  const sendInvite = useMutation({
    mutationFn: async (contact: string) => {
      const trimmed = contact.trim();
      const isEmail = trimmed.includes('@');

      // 1. Create the invite record
      const { data: inviteData, error: insertError } = await supabase
        .from('community_invites')
        .insert({ mentor_id: user!.id, invited_by: user!.id, contact: trimmed })
        .select('id')
        .single();
      if (insertError) throw insertError;

      // 2. If email invite → create student account + send invite email via edge function
      if (isEmail) {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-student`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ inviteId: inviteData.id, email: trimmed, mentorId: user!.id }),
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'שגיאה בשליחת ההזמנה');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      setInviteContact('');
      toast({ title: 'הזמנה נשלחה ✉️', description: 'התלמיד יקבל מייל עם קישור להגדרת סיסמה' });
    },
    onError: (err) => toast({ title: 'שגיאה', description: err instanceof Error ? err.message : 'לא ניתן לשלוח הזמנה', variant: 'destructive' }),
  });

  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('community_invites').update({ status: 'declined' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      toast({ title: 'הזמנה בוטלה' });
    },
    onError: () => toast({ title: 'שגיאה בביטול ההזמנה', variant: 'destructive' }),
  });

  const removeMember = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase.from('community_members').delete().eq('mentor_id', user!.id).eq('student_id', studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast({ title: 'התלמיד הוסר מהקהילה' });
      setRemoveConfirm(null);
    },
    onError: () => toast({ title: 'שגיאה בהסרת התלמיד', variant: 'destructive' }),
  });

  const updateNickname = useMutation({
    mutationFn: async ({ studentId, displayName }: { studentId: string; displayName: string }) => {
      const val = displayName.trim() || null;
      const { error } = await supabase.from('community_members').update({ display_name: val } as any).eq('mentor_id', user!.id).eq('student_id', studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setEditingNickname(null);
      toast({ title: 'הכינוי עודכן בהצלחה' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון הכינוי', variant: 'destructive' }),
  });

  const grantAccess = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('student_category_access').insert({
        mentor_id: user!.id,
        student_id: accessStudentId!,
        category_id: categoryId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-grants', user?.id, accessStudentId] }),
    onError: () => toast({ title: 'שגיאה בהענקת הרשאה', variant: 'destructive' }),
  });

  const revokeAccess = useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('student_category_access')
        .delete()
        .eq('mentor_id', user!.id)
        .eq('student_id', accessStudentId!)
        .eq('category_id', categoryId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['access-grants', user?.id, accessStudentId] }),
    onError: () => toast({ title: 'שגיאה בביטול הרשאה', variant: 'destructive' }),
  });

  const createPost = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('community_posts').insert({
        mentor_id: user!.id,
        content: postContent,
        post_type: postType,
        media_url: postMediaUrl || null,
        media_type: postMediaType || null,
        is_pinned: false,
      }).select('id').single();
      if (error) throw error;
      if (data?.id) {
        supabase.functions.invoke('notify-new-post', {
          body: { post_id: data.id, mentor_id: user!.id },
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_posts'] });
      setPostContent(''); setPostMediaUrl(''); setPostMediaType(''); setPostType('discussion');
      toast({ title: 'פוסט פורסם!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום', variant: 'destructive' }),
  });

  const updatePost = useMutation({
    mutationFn: async ({ id, content, media_url, media_type }: { id: string; content: string; media_url: string | null; media_type: string | null }) => {
      const { error } = await supabase.from('community_posts').update({ content, media_url, media_type }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_posts'] });
      setEditPost(null);
      toast({ title: 'פוסט עודכן בהצלחה' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון הפוסט', variant: 'destructive' }),
  });

  const handleEditPostFileUpload = async (file: File): Promise<{ url: string; type: string }> => {
    setIsEditPostUploading(true);
    const ext = file.name.split('.').pop();
    const path = `posts/${user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: false });
    setIsEditPostUploading(false);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
    return { url: publicUrl, type: file.type.startsWith('video') ? 'video' : 'image' };
  };

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
        const [{ data: profile }, cmRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('user_id', c.author_id).single(),
          supabase.from('community_members').select('display_name').eq('mentor_id', user!.id).eq('student_id', c.author_id).maybeSingle(),
        ]);
        const dn = (cmRes.data as any)?.display_name;
        return { ...c, profiles: dn ? { full_name: dn } : profile };
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
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-primary" />;
    if (type === 'presentation') return <FileText className="w-3.5 h-3.5 text-accent" />;
    if (type === 'live') return <Radio className="w-3.5 h-3.5 text-destructive" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'zoom_recording') return 'הקלטת זום';
    if (type === 'presentation') return 'מצגת';
    if (type === 'live') return 'לייב מוקלט';
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
  ];

  const postTypeBg: Record<string, string> = { discussion: 'bg-primary/10', media: 'bg-accent/10' };
  const postTypeColor: Record<string, string> = { discussion: 'text-primary', media: 'text-accent' };
  const postTypeLabel: Record<string, string> = { discussion: 'דיון', media: 'מדיה' };
  const postTypeIcon = (type: string) => {
    if (type === 'media') return <Image className="w-3.5 h-3.5" />;
    return <MessageCircle className="w-3.5 h-3.5" />;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const isPresentation = lessonForm.lesson_type === 'presentation';
  const uncategorized = lessons.filter(l => !l.category_id);

  const grantedCategoryIds = new Set(accessGrants.map(g => g.category_id));

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((lessonId: string) => {
    setDragLesson(lessonId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, lessonId: string) => {
    e.preventDefault();
    setDragOverLesson(lessonId);
  }, []);

  const handleDrop = useCallback((categoryId: string | null, lessons: Lesson[]) => {
    if (!dragLesson || !dragOverLesson || dragLesson === dragOverLesson) {
      setDragLesson(null); setDragOverLesson(null); return;
    }
    const ids = lessons.map(l => l.id);
    const fromIdx = ids.indexOf(dragLesson);
    const toIdx = ids.indexOf(dragOverLesson);
    if (fromIdx === -1 || toIdx === -1) { setDragLesson(null); setDragOverLesson(null); return; }
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, dragLesson);
    reorderLessons.mutate(reordered);
    setDragLesson(null); setDragOverLesson(null);
  }, [dragLesson, dragOverLesson, reorderLessons]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 h-full">
        <AnimatePresence mode="wait">
          {lessonViewMode ? (
            /* ── Lesson View Mode Sidebar ── */
            <motion.div key="lesson-sidebar" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="flex flex-col h-full">
              <div className="p-4 border-b border-sidebar-border">
                <button
                  onClick={() => { setLessonViewMode(null); setSelectedLesson(null); }}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity mb-3"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                  חזור לתפריט הראשי
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-sidebar-foreground truncate">{lessonViewMode.categoryTitle}</h3>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {(() => {
                  const catLessons = lessons.filter(l => l.category_id === lessonViewMode.categoryId);
                  if (catLessons.length === 0) return <div className="px-4 py-8 text-center text-xs text-muted-foreground">אין שיעורים בקטגוריה זו</div>;
                  return catLessons.map((lesson, idx) => {
                    const isSelected = selectedLesson === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => setSelectedLesson(isSelected ? null : lesson.id)}
                        className={`w-full text-start flex items-start gap-3 px-4 py-3 transition-all hover:bg-sidebar-accent/60 ${isSelected ? 'bg-sidebar-accent border-e-2 border-primary' : ''}`}
                      >
                        <span className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-muted-foreground">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-tight truncate ${isSelected ? 'text-primary' : 'text-sidebar-foreground'}`}>{lesson.title}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {lesson.duration_minutes && <span className="text-[10px] text-muted-foreground">{lesson.duration_minutes} דק'</span>}
                            {lesson.attachment_url && <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70"><Paperclip className="w-2.5 h-2.5" />צירוף</span>}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${lesson.is_published ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>{lesson.is_published ? 'פורסם' : 'טיוטה'}</span>
                          </div>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="p-3 border-t border-sidebar-border">
                <div className="flex items-center gap-3 px-2 py-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">{user?.email?.[0]?.toUpperCase()}</div>
                  <div className="flex-1 min-w-0"><div className="text-xs font-medium text-foreground truncate">{mentorProfile?.full_name || user?.email}</div></div>
                  <button onClick={signOut} className="text-muted-foreground hover:text-destructive transition-colors"><LogOut className="w-4 h-4" /></button>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Normal Sidebar ── */
            <motion.div key="main-sidebar" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }} className="flex flex-col h-full">
              <div className="p-5 border-b border-sidebar-border">
                <button
                  onClick={signOut}
                  className="flex items-center gap-3 w-full text-right hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-sidebar-foreground">TradeLearn</div>
                    <div className="text-xs text-muted-foreground">מנטור</div>
                  </div>
                </button>
              </div>

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
               {([
                   { key: 'lessons', label: 'שיעורים', icon: BookOpen },
                   { key: 'community', label: 'קהילה', icon: Users },
                   { key: 'students', label: 'תלמידים', icon: GraduationCap },
                   { key: 'live', label: 'לייב', icon: Radio },
                   { key: 'questions', label: 'שאלות', icon: MessageCircleQuestion },
                   { key: 'quizzes', label: 'מבחנים', icon: ClipboardList },
                 ] as { key: SidebarTab; label: string; icon: typeof BookOpen }[]).map(({ key, label, icon: Icon }) => (
                   <button
                     key={key}
                     onClick={() => { setActiveTab(key); if (key !== 'quizzes') setQuizNavLessonId(null); }}
                     className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                       activeTab === key
                         ? 'bg-sidebar-accent text-sidebar-foreground'
                         : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                     }`}
                   >
                     <Icon className="w-4 h-4" />
                     <span className="flex-1 text-right">{label}</span>
                     {key === 'questions' && unansweredCount > 0 && (
                       <span className="min-w-[20px] h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                         {unansweredCount > 99 ? '99+' : unansweredCount}
                       </span>
                     )}
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
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Main */}
      <main className={`flex-1 ${activeTab === 'questions' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        <AnimatePresence mode="wait">

          {/* ──────── LESSONS ──────── */}
          {activeTab === 'lessons' && (
            <motion.div key={lessonViewMode ? `lesson-view-${selectedLesson}` : 'lessons'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={lessonViewMode && selectedLesson ? "p-8 w-full" : "p-8 max-w-4xl"}>

              {/* ── Lesson View Mode (player in main area, list in sidebar) ── */}
              {lessonViewMode ? (
                <AnimatePresence mode="wait">
                  {selectedLesson ? (() => {
                    const lesson = lessons.find(l => l.id === selectedLesson);
                    if (!lesson) return null;
                    return (
                      <motion.div key={lesson.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-6 items-start">
                        {/* Left column: lesson content */}
                        <div className="flex-1 min-w-0 bg-card rounded-xl card-shadow overflow-hidden">
                          {/* Video area */}
                          <div className="aspect-video bg-foreground/5 border-b border-border flex items-center justify-center">
                            {lesson.video_url ? (
                              <video src={lesson.video_url} className="w-full h-full" controls />
                            ) : (
                              <div className="text-center">
                                <Video className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-40" />
                                <p className="text-sm text-muted-foreground">אין קובץ וידאו</p>
                              </div>
                            )}
                          </div>
                          <div className="p-6">
                            <div className="flex items-start justify-between gap-4">
                              <h2 className="text-xl font-bold text-foreground">{lesson.title}</h2>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${lesson.is_published ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                                  {lesson.is_published ? 'פורסם' : 'טיוטה'}
                                </span>
                                <button
                                  onClick={() => { setEditLesson(lesson); setEditForm({ title: lesson.title, description: lesson.description ?? '', video_url: lesson.video_url ?? '', duration_minutes: lesson.duration_minutes?.toString() ?? '', attachment_url: lesson.attachment_url ?? '', attachment_name: lesson.attachment_name ?? '' }); }}
                                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-all"
                                >
                                  <Pencil className="w-3.5 h-3.5" />ערוך
                                </button>
                              </div>
                            </div>
                            {lesson.description && <p className="text-sm text-muted-foreground mt-2">{lesson.description}</p>}
                            {lesson.duration_minutes && (
                              <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                                <span>{lesson.duration_minutes} דקות</span>
                              </div>
                            )}
                          </div>
                          {/* Inline attachment viewer */}
                          {lesson.attachment_url && (
                            <AttachmentViewer url={lesson.attachment_url} name={lesson.attachment_name ?? ''} />
                          )}
                          {/* Q&A for mentor to see/answer */}
                          <div className="px-6 pb-6">
                            <LessonQA
                              lessonId={lesson.id}
                              mentorId={user!.id}
                              studentId={user!.id}
                              studentName={mentorProfile?.full_name || user?.email || 'מנטור'}
                              isMentor={true}
                            />
                          </div>
                          {/* Student watch progress */}
                          <div className="px-6 pb-6">
                            <div className="border border-border rounded-xl p-4">
                              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                                <Eye className="w-4 h-4 text-primary" />
                                התקדמות צפייה של תלמידים
                              </h3>
                              <LessonStudentProgress lessonId={lesson.id} mentorId={user?.id} />
                            </div>
                          </div>
                        </div>
                        {/* Right column: quiz panel */}
                        <LessonQuizPanel lessonId={lesson.id} mentorId={user!.id} onCreateQuiz={() => { setQuizNavLessonId(lesson.id); setActiveTab('quizzes'); }} />
                      </motion.div>
                    );
                  })() : (
                    <div className="text-center py-24 text-muted-foreground">
                      <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">בחר שיעור מהרשימה</p>
                      <p className="text-sm mt-1">לחץ על שיעור בסרגל הצד כדי לצפות בו</p>
                    </div>
                  )}
                </AnimatePresence>
              ) : (
                <>
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
                              ) : catLessons.map((lesson, idx) => (
                                <LessonRow key={lesson.id} lesson={lesson} index={idx + 1}
                                  isDragging={dragLesson === lesson.id}
                                  isDragOver={dragOverLesson === lesson.id}
                                  onDragStart={() => handleDragStart(lesson.id)}
                                  onDragOver={(e) => handleDragOver(e, lesson.id)}
                                  onDrop={() => handleDrop(cat.id, catLessons)}
                                  onDragEnd={() => { setDragLesson(null); setDragOverLesson(null); }}
                                  onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                                  onDelete={() => deleteLesson.mutate(lesson.id)}
                                  onEdit={() => { setEditLesson(lesson); setEditForm({ title: lesson.title, description: lesson.description ?? '', video_url: lesson.video_url ?? '', duration_minutes: lesson.duration_minutes?.toString() ?? '', attachment_url: lesson.attachment_url ?? '', attachment_name: lesson.attachment_name ?? '' }); }}
                                  onView={() => { setLessonViewMode({ categoryId: cat.id, categoryTitle: cat.title }); setSelectedLesson(lesson.id); }}
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
                      {uncategorized.map((lesson, idx) => (
                        <LessonRow key={lesson.id} lesson={lesson} index={idx + 1}
                          isDragging={dragLesson === lesson.id}
                          isDragOver={dragOverLesson === lesson.id}
                          onDragStart={() => handleDragStart(lesson.id)}
                          onDragOver={(e) => handleDragOver(e, lesson.id)}
                          onDrop={() => handleDrop(null, uncategorized)}
                          onDragEnd={() => { setDragLesson(null); setDragOverLesson(null); }}
                          onTogglePublish={() => togglePublish.mutate({ id: lesson.id, is_published: lesson.is_published })}
                          onDelete={() => deleteLesson.mutate(lesson.id)}
                          onEdit={() => { setEditLesson(lesson); setEditForm({ title: lesson.title, description: lesson.description ?? '', video_url: lesson.video_url ?? '', duration_minutes: lesson.duration_minutes?.toString() ?? '', attachment_url: lesson.attachment_url ?? '', attachment_name: lesson.attachment_name ?? '' }); }}
                          onView={() => { setLessonViewMode({ categoryId: '', categoryTitle: 'ללא קטגוריה' }); setSelectedLesson(lesson.id); }}
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
              </>
              )}
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
                    postType === 'media' ? 'תאר את התמונה/סרטון שאתה מעלה...'
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
                          className="absolute top-2 left-2 w-7 h-7 bg-foreground/60 rounded-full flex items-center justify-center text-background hover:bg-foreground/80"
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
                    onEdit={() => {
                      setEditPost(post);
                      setEditPostContent(post.content);
                      setEditPostMediaUrl(post.media_url ?? '');
                      setEditPostMediaType(post.media_type ?? '');
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
                  <h2 className="font-semibold text-foreground mb-3">הזמנות ממתינות ({invites.length})</h2>
                  <div className="space-y-2">
                    {invites.map((inv: { id: string; contact: string; created_at: string }) => (
                      <div key={inv.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors group">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Send className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-foreground">{inv.contact}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(inv.created_at).toLocaleDateString('he-IL')} · ממתין לאישור
                          </p>
                        </div>
                        <button
                          onClick={() => deleteInvite.mutate(inv.id)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          title="בטל הזמנה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                    {members.map((m) => {
                      const displayName = m.display_name || m.profiles?.full_name || 'תלמיד';
                      const isEditing = editingNickname === m.student_id;
                      return (
                      <div key={m.student_id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/30 transition-colors group">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                          {displayName[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                updateNickname.mutate({ studentId: m.student_id, displayName: nicknameValue });
                              }}
                            >
                              <input
                                autoFocus
                                className="h-7 px-2 text-sm border border-border rounded-md bg-background text-foreground w-full max-w-[180px]"
                                value={nicknameValue}
                                onChange={(e) => setNicknameValue(e.target.value)}
                                placeholder={m.profiles?.full_name || 'כינוי'}
                              />
                              <button type="submit" className="w-6 h-6 flex items-center justify-center rounded text-accent hover:bg-accent/10">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => setEditingNickname(null)} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground">{displayName}</span>
                              {m.display_name && (
                                <span className="text-[10px] text-muted-foreground">({m.profiles?.full_name})</span>
                              )}
                              <button
                                onClick={() => { setEditingNickname(m.student_id); setNicknameValue(m.display_name || ''); }}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-primary transition-all"
                                title="ערוך כינוי"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">{m.profiles?.email}</div>
                        </div>
                        <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full shrink-0">
                          הצטרף {new Date(m.joined_at).toLocaleDateString('he-IL')}
                        </div>
                        {/* Permissions button */}
                        <button
                          onClick={() => { setAccessStudentId(m.student_id); setAccessStudentName(displayName); }}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-primary/60 hover:text-primary hover:bg-primary/10 transition-all"
                          title="נהל הרשאות קטגוריות"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setRemoveConfirm({ studentId: m.student_id, name: displayName })}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          title="הסר מהקהילה"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ──────── LIVE ──────── */}
          {activeTab === 'live' && user && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LiveHubMentor mentorId={user.id} userId={user.id} userName={mentorProfile?.full_name || user?.email || 'מנטור'} />
            </motion.div>
          )}

          {/* ──────── QUESTIONS ──────── */}
          {activeTab === 'questions' && user && (
            <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0 h-full overflow-hidden">
              <MentorQuestionsHub mentorId={user.id} />
            </motion.div>
          )}

          {/* ──────── QUIZZES ──────── */}
          {activeTab === 'quizzes' && user && (
            <motion.div key="quizzes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-h-0 h-full overflow-hidden">
              <MentorQuizzesHub mentorId={user.id} initialLessonId={quizNavLessonId} />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* ── Category Access Panel ── */}
      <AnimatePresence>
        {accessStudentId && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/20 z-40" onClick={() => setAccessStudentId(null)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[400px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <button onClick={() => setAccessStudentId(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold text-foreground">הרשאות קטגוריות</h2>
                  <div />
                </div>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  בחר לאילו קטגוריות <span className="font-semibold text-foreground">{accessStudentName}</span> יכול לגשת
                </p>

                {/* All-access note */}
                <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 mb-5 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    ללא הרשאות ספציפיות — התלמיד רואה את כל הקטגוריות הפומביות. הגדר כאן הרשאות להגבלת גישה לקטגוריות נבחרות בלבד.
                  </p>
                </div>

                {categories.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <LayoutGrid className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">אין קטגוריות עדיין</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map(cat => {
                      const hasAccess = grantedCategoryIds.has(cat.id);
                      const catLessons = lessons.filter(l => l.category_id === cat.id);
                      return (
                        <div
                          key={cat.id}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                            hasAccess
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border bg-background hover:border-border/80'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            hasAccess ? 'bg-primary/10' : 'bg-muted'
                          }`}>
                            {hasAccess
                              ? <Unlock className="w-4 h-4 text-primary" />
                              : <Lock className="w-4 h-4 text-muted-foreground" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${hasAccess ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {cat.title}
                            </p>
                            <p className="text-xs text-muted-foreground">{catLessons.length} שיעורים</p>
                          </div>
                          <button
                            onClick={() => hasAccess ? revokeAccess.mutate(cat.id) : grantAccess.mutate(cat.id)}
                            disabled={grantAccess.isPending || revokeAccess.isPending}
                            className={`h-8 px-3 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                              hasAccess
                                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                : 'bg-primary text-primary-foreground hover:opacity-90'
                            }`}
                          >
                            {hasAccess ? 'בטל גישה' : 'אשר גישה'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {grantedCategoryIds.size > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      <span className="font-semibold text-foreground">{grantedCategoryIds.size}</span> קטגוריות עם גישה מוגדרת
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Remove student confirmation dialog */}
      <AnimatePresence>
        {removeConfirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black z-50" onClick={() => setRemoveConfirm(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm" dir="rtl">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <h3 className="text-base font-bold text-foreground text-center mb-1">הסרת תלמיד</h3>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  האם להסיר את <span className="font-semibold text-foreground">{removeConfirm.name}</span> מהקהילה?
                  <br />פעולה זו לא ניתנת לביטול.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setRemoveConfirm(null)}
                    className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => removeMember.mutate(removeConfirm.studentId)}
                    disabled={removeMember.isPending}
                    className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {removeMember.isPending ? 'מסיר...' : 'הסר'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Lesson slide panel */}
      <AnimatePresence>
        {showLessonPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowLessonPanel(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[440px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
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

                  {/* Video upload */}
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

                  {/* Attachment upload */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4 text-muted-foreground" />
                        קובץ מצורף (אופציונלי)
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground mb-2">צרף מצגת, PDF, תמונה או כל מסמך שתלמידים יוכלו לפתוח לצד הסרטון</p>
                    <input
                      ref={attachmentInputRef} type="file"
                      accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.zip"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { url, name } = await handleAttachmentUpload(file);
                          setLessonForm(f => ({ ...f, attachment_url: url, attachment_name: name }));
                          toast({ title: 'הקובץ המצורף הועלה בהצלחה' });
                        } catch { toast({ title: 'שגיאה בהעלאת הקובץ המצורף', variant: 'destructive' }); }
                      }}
                    />
                    {lessonForm.attachment_url ? (
                      <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <Paperclip className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs text-primary flex-1 truncate">{lessonForm.attachment_name}</span>
                        <button
                          onClick={() => { setLessonForm(f => ({ ...f, attachment_url: '', attachment_name: '' })); if (attachmentInputRef.current) attachmentInputRef.current.value = ''; }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={isAttachmentUploading}
                        className="w-full h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all disabled:opacity-50 text-sm"
                      >
                        {isAttachmentUploading
                          ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs">מעלה...</span></>
                          : <><Paperclip className="w-4 h-4" /><span className="text-xs font-medium">PDF, PPT, DOC, תמונה, ZIP...</span></>
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
                    disabled={!lessonForm.title.trim() || createLesson.isPending || isUploading || isAttachmentUploading}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {createLesson.isPending ? 'שומר...' : 'צור שיעור'}
                  </button>

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">או</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <button
                    onClick={() => {
                      setShowLessonPanel(false);
                      setQuizNavLessonId(null);
                      setActiveTab('quizzes');
                    }}
                    className="w-full h-11 border border-primary/30 bg-primary/5 text-primary rounded-lg font-medium hover:bg-primary/10 transition-all flex items-center justify-center gap-2"
                  >
                    <ClipboardList className="w-4 h-4" />צור מבחן לשיעור זה
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Live section rendered inside main via tab */}

      {/* ── Edit Post Panel ── */}
      <AnimatePresence>
        {editPost && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/20 z-40" onClick={() => setEditPost(null)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[440px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">עריכת פוסט</h2>
                  <button onClick={() => setEditPost(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">תוכן</label>
                    <textarea
                      value={editPostContent}
                      onChange={e => setEditPostContent(e.target.value)}
                      rows={5}
                      className="w-full px-4 py-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right resize-none"
                    />
                  </div>

                  {editPost.post_type === 'media' && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">תמונה / וידאו</label>
                      <input
                        ref={editPostFileInputRef} type="file" accept="image/*,video/*" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const { url, type } = await handleEditPostFileUpload(file);
                            setEditPostMediaUrl(url); setEditPostMediaType(type);
                            toast({ title: 'הקובץ הועלה בהצלחה' });
                          } catch { toast({ title: 'שגיאה בהעלאה', variant: 'destructive' }); }
                        }}
                      />
                      {editPostMediaUrl ? (
                        <div className="relative rounded-xl overflow-hidden">
                          {editPostMediaType === 'video'
                            ? <video src={editPostMediaUrl} className="w-full max-h-64 object-cover rounded-xl" controls />
                            : <img src={editPostMediaUrl} alt="preview" className="w-full max-h-64 object-cover rounded-xl" />
                          }
                          <div className="absolute top-2 left-2 flex gap-1.5">
                            <button
                              onClick={() => editPostFileInputRef.current?.click()}
                              disabled={isEditPostUploading}
                              className="h-7 px-2 bg-foreground/60 rounded-full text-background text-xs hover:bg-foreground/80 flex items-center gap-1"
                            >
                              {isEditPostUploading ? <div className="w-3 h-3 border border-background border-t-transparent rounded-full animate-spin" /> : <><Upload className="w-3 h-3" />החלף</>}
                            </button>
                            <button
                              onClick={() => { setEditPostMediaUrl(''); setEditPostMediaType(''); }}
                              className="w-7 h-7 bg-foreground/60 rounded-full flex items-center justify-center text-background hover:bg-foreground/80"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => editPostFileInputRef.current?.click()}
                          disabled={isEditPostUploading}
                          className="w-full h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-50 text-sm"
                        >
                          {isEditPostUploading
                            ? <><div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span>מעלה...</span></>
                            : <><Upload className="w-4 h-4" /><span>העלה תמונה או וידאו</span></>
                          }
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => editPostContent.trim() && updatePost.mutate({ id: editPost.id, content: editPostContent, media_url: editPostMediaUrl || null, media_type: editPostMediaType || null })}
                    disabled={!editPostContent.trim() || updatePost.isPending || isEditPostUploading}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {updatePost.isPending ? 'שומר...' : 'שמור שינויים'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Edit Lesson Panel ── */}
      <AnimatePresence>
        {editLesson && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/20 z-40" onClick={() => setEditLesson(null)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-[440px] bg-card z-50 shadow-2xl border-l border-border overflow-y-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-foreground">עריכת שיעור</h2>
                  <button onClick={() => setEditLesson(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">כותרת השיעור *</label>
                    <input
                      value={editForm.title}
                      onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">תיאור</label>
                    <textarea
                      value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      className="w-full px-4 py-3 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right resize-none"
                    />
                  </div>

                  {/* Video replacement */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">קובץ וידאו</label>
                    <input ref={editVideoInputRef} type="file" accept="video/*,.pdf,.ppt,.pptx" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const url = await handleEditVideoUpload(file);
                          setEditForm(f => ({ ...f, video_url: url }));
                          toast({ title: 'הוידאו הוחלף בהצלחה' });
                        } catch { toast({ title: 'שגיאה בהעלאה', variant: 'destructive' }); }
                      }}
                    />
                    {editForm.video_url ? (
                      <div className="flex items-center gap-2 p-3 bg-accent/5 border border-accent/20 rounded-lg">
                        <Check className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-xs text-accent flex-1 truncate">יש קובץ וידאו</span>
                        <button
                          onClick={() => editVideoInputRef.current?.click()}
                          disabled={isEditVideoUploading}
                          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                        >
                          {isEditVideoUploading ? 'מעלה...' : 'החלף'}
                        </button>
                        <button onClick={() => setEditForm(f => ({ ...f, video_url: '' }))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => editVideoInputRef.current?.click()} disabled={isEditVideoUploading}
                        className="w-full h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-accent hover:text-accent transition-all disabled:opacity-50"
                      >
                        {isEditVideoUploading
                          ? <><div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" /><span className="text-xs">מעלה...</span></>
                          : <><Upload className="w-5 h-5" /><span className="text-xs font-medium">העלה וידאו חדש</span></>
                        }
                      </button>
                    )}
                  </div>

                  {/* Attachment replacement */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      <span className="flex items-center gap-1.5"><Paperclip className="w-4 h-4 text-muted-foreground" />קובץ מצורף</span>
                    </label>
                    <input ref={editAttachmentInputRef} type="file"
                      accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.zip"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { url, name } = await handleEditAttachmentUpload(file);
                          setEditForm(f => ({ ...f, attachment_url: url, attachment_name: name }));
                          toast({ title: 'הצירוף הוחלף בהצלחה' });
                        } catch { toast({ title: 'שגיאה בהעלאת הצירוף', variant: 'destructive' }); }
                      }}
                    />
                    {editForm.attachment_url ? (
                      <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <Paperclip className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs text-primary flex-1 truncate">{editForm.attachment_name || 'קובץ מצורף'}</span>
                        <button
                          onClick={() => editAttachmentInputRef.current?.click()}
                          disabled={isEditAttachmentUploading}
                          className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                        >
                          {isEditAttachmentUploading ? 'מעלה...' : 'החלף'}
                        </button>
                        <button onClick={() => setEditForm(f => ({ ...f, attachment_url: '', attachment_name: '' }))} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => editAttachmentInputRef.current?.click()} disabled={isEditAttachmentUploading}
                        className="w-full h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all disabled:opacity-50 text-sm"
                      >
                        {isEditAttachmentUploading
                          ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs">מעלה...</span></>
                          : <><Paperclip className="w-4 h-4" /><span className="text-xs font-medium">הוסף / החלף קובץ מצורף</span></>
                        }
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">משך (דקות)</label>
                    <input type="number" value={editForm.duration_minutes}
                      onChange={e => setEditForm(f => ({ ...f, duration_minutes: e.target.value }))}
                      placeholder="45"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent text-right"
                    />
                  </div>

                  <button
                    onClick={() => editForm.title.trim() && updateLesson.mutate()}
                    disabled={!editForm.title.trim() || updateLesson.isPending || isEditVideoUploading || isEditAttachmentUploading}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {updateLesson.isPending ? 'שומר...' : 'שמור שינויים'}
                  </button>

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">או</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <button
                    onClick={() => {
                      setEditLesson(null);
                      setQuizNavLessonId(editLesson?.id ?? null);
                      setActiveTab('quizzes');
                    }}
                    className="w-full h-11 border border-primary/30 bg-primary/5 text-primary rounded-lg font-medium hover:bg-primary/10 transition-all flex items-center justify-center gap-2"
                  >
                    <ClipboardList className="w-4 h-4" />צור מבחן לשיעור זה
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

// ─── LessonRow ────────────────────────────────────────────────────────────────
function LessonRow({
  lesson, index, isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onTogglePublish, onDelete, onEdit, onView, typeIcon, typeLabel,
}: {
  lesson: Lesson;
  index?: number;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onView: () => void;
  typeIcon: (t: string) => React.ReactNode;
  typeLabel: (t: string) => string;
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group cursor-pointer select-none
        ${isDragOver ? 'border-t-2 border-primary bg-primary/5' : ''}
        ${isDragging ? 'opacity-40' : 'opacity-100'}
      `}
      onClick={onView}
    >
      {/* Drag handle + number */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className="opacity-0 group-hover:opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity text-muted-foreground"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        {index !== undefined && (
          <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">
            {index}
          </span>
        )}
      </div>
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        {typeIcon(lesson.lesson_type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{lesson.title}</span>
          {lesson.lesson_type === 'live' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold shrink-0 tracking-wide">
              <Radio className="w-2.5 h-2.5" />הוקלט בלייב
            </span>
          )}
          {lesson.attachment_url && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-medium shrink-0">
              <Paperclip className="w-2.5 h-2.5" />צירוף
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{typeLabel(lesson.lesson_type)}</span>
      </div>
      {lesson.duration_minutes && (
        <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
      )}
      <button onClick={e => { e.stopPropagation(); onEdit(); }}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all" title="ערוך שיעור">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={e => { e.stopPropagation(); onTogglePublish(); }}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${lesson.is_published ? 'text-accent hover:bg-accent/10' : 'text-muted-foreground hover:bg-muted'}`}
        title={lesson.is_published ? 'הסתר שיעור' : 'פרסם שיעור'}>
        {lesson.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── MentorPostCard ───────────────────────────────────────────────────────────
function MentorPostCard({
  post, fetchComments, expanded, onToggleComments,
  commentText, onCommentChange, onAddComment, onDelete, onTogglePin, onEdit,
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
  onEdit: () => void;
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

  const { lightbox, openLightbox, closeLightbox } = useMediaLightbox();
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
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${post.is_pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
              title={post.is_pinned ? 'הסר נעיצה' : 'נעץ פוסט'}
            >
              {post.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="ערוך פוסט">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {post.media_url && (
          <div className="mt-3 rounded-xl overflow-hidden cursor-pointer" onClick={() => openLightbox(post.media_url!, (post.media_type as 'video' | 'image') || 'image')}>
            {post.media_type === 'video'
              ? <video src={post.media_url} className="w-full max-h-80 object-cover" />
              : <img src={post.media_url} alt="" className="w-full max-h-80 object-cover" />
            }
          </div>
        )}
        {lightbox && <MediaLightbox open={!!lightbox} onOpenChange={closeLightbox} url={lightbox.url} type={lightbox.type} />}
      </div>

      <div className="px-5 pb-3 border-t border-border pt-3">
        <button
          onClick={onToggleComments}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {expanded ? 'הסתר תגובות' : `הצג תגובות${comments.length > 0 ? ` (${comments.length})` : ''}`}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-5 pb-4 space-y-2.5 border-t border-border pt-3">
              {commentsLoading ? (
                <div className="flex justify-center py-2"><div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">אין תגובות עדיין</p>
              ) : comments.map(c => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                    {c.profiles?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 bg-muted/50 rounded-xl px-3 py-2">
                    <p className="text-xs font-semibold text-foreground mb-0.5">{c.profiles?.full_name ?? 'משתמש'}</p>
                    <p className="text-xs text-foreground/80 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <input
                  value={commentText}
                  onChange={e => onCommentChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && commentText.trim() && onAddComment()}
                  placeholder="הוסף תגובה..."
                  className="flex-1 h-9 px-3 bg-surface border-none ring-1 ring-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                />
                <button
                  onClick={onAddComment}
                  disabled={!commentText.trim()}
                  className="h-9 w-9 flex items-center justify-center bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
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
