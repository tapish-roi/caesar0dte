import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MediaLightbox, { useMediaLightbox } from '@/components/MediaLightbox';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, BookOpen, Users, Video, Film, FileText,
  LogOut, Clock, CheckCircle2, ChevronDown, Bell, MessageSquare,
  MessageCircle, Send, Image, Wifi, Pin, ChevronLeft, ArrowRight,
  User, Phone, Camera, X, Trash2, Mail, Lock, Settings, Eye, EyeOff, Radio, Paperclip,
  CalendarDays, Filter, XCircle, MessageCircleQuestion, ClipboardList,
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { he } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import type { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import LiveViewer from '@/components/LiveViewer';
import AttachmentViewer from '@/components/AttachmentViewer';
import LiveHubStudent from '@/components/LiveHubStudent';
import LessonQA from '@/components/LessonQA';
import StudentMyQuestions from '@/components/StudentMyQuestions';

type SidebarTab = 'lessons' | 'community' | 'live' | 'questions';
type PostType = 'discussion' | 'media' | 'live';
type LessonViewMode = { categoryId: string; categoryTitle: string } | null;

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
  created_at: string;
  video_url: string | null;
  category_id: string | null;
  duration_minutes: number | null;
  attachment_url: string | null;
  attachment_name: string | null;
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

interface ProfileItem {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  notify_sms: boolean;
  notify_email: boolean;
}

// ─── VideoPlayer with progress tracking ───────────────────────────────────────
function VideoPlayer({
  src, lessonId, studentId, initialProgress, onComplete,
}: {
  src: string;
  lessonId: string;
  studentId: string;
  initialProgress: ProgressItem | undefined;
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedPercent = useRef(initialProgress?.progress_percent ?? 0);
  const completed = useRef(initialProgress?.completed ?? false);

  const saveProgress = useCallback(async (percent: number, done: boolean) => {
    if (done && completed.current) return; // already marked
    if (!done && Math.abs(percent - lastSavedPercent.current) < 5) return; // only save every ~5%

    lastSavedPercent.current = percent;
    if (done) completed.current = true;

    await supabase.from('lesson_progress').upsert(
      { lesson_id: lessonId, student_id: studentId, progress_percent: percent, completed: done, last_watched_at: new Date().toISOString() },
      { onConflict: 'lesson_id,student_id' }
    );
    if (done) onComplete();
  }, [lessonId, studentId, onComplete]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = Math.round((v.currentTime / v.duration) * 100);
    if (pct >= 90) saveProgress(100, true);
    else saveProgress(pct, false);
  }, [saveProgress]);

  const handleEnded = useCallback(() => saveProgress(100, true), [saveProgress]);

  return (
    <video
      ref={videoRef}
      src={src}
      className="w-full h-full"
      controls
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
    />
  );
}

// ─── Landing Screen (unified) ─────────────────────────────────────────────────
function LandingScreen({
  memberships,
  invites,
  onSelect,
  onAccept,
  onDecline,
  onSignOut,
  userEmail,
}: {
  memberships: MembershipItem[];
  invites: InviteItem[];
  onSelect: (mentorId: string) => void;
  onAccept: (invite: { id: string; mentor_id: string }) => void;
  onDecline: (id: string) => void;
  onSignOut: () => void;
  userEmail?: string;
}) {
  const hasCommunities = memberships.length > 0;
  const hasInvites = invites.length > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-10"
      >
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-foreground">TradeLearn</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="w-full max-w-md bg-card rounded-2xl card-shadow overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">כניסה לקהילות שלי</h2>
          </div>
        </div>

        <div className="p-5">
          {/* ── State 1: has communities ── */}
          {hasCommunities && (
            <div className="space-y-2.5">
              {memberships.map((m, i) => (
                <motion.button
                  key={m.mentor_id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => onSelect(m.mentor_id)}
                  className="w-full flex items-center gap-4 p-4 bg-background rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-right group"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-base shrink-0">
                    {m.avatarLetter}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-foreground">{m.mentorName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">קהילת מסחר</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors rotate-180" />
                </motion.button>
              ))}

              {hasInvites && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5" />
                    הזמנות ממתינות
                  </p>
                  <div className="space-y-2">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-3 p-3 bg-muted/60 border border-border rounded-xl">
                         <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                           <span className="text-xs font-bold text-primary">{inv.mentorName[0]?.toUpperCase()}</span>
                         </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{inv.mentorName}</p>
                          <p className="text-xs text-muted-foreground">הזמין אותך לקהילה שלו</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => onAccept({ id: inv.id, mentor_id: inv.mentor_id })}
                            className="h-7 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                          >
                            הצטרף
                          </button>
                          <button
                            onClick={() => onDecline(inv.id)}
                            className="h-7 w-7 flex items-center justify-center border border-border text-muted-foreground rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                            title="מחק הזמנה"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── State 2: no communities but has invites ── */}
          {!hasCommunities && hasInvites && (
            <div className="space-y-2.5">
              <p className="text-sm text-muted-foreground mb-3">
                קיבלת הזמנות לקהילות הבאות. לחץ הצטרף כדי להיכנס.
              </p>
              {invites.map((inv, i) => (
                <motion.div
                  key={inv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-3 p-4 bg-background border border-border rounded-xl"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-base font-bold text-primary">{inv.mentorName[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{inv.mentorName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">מנטור מסחר</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => onAccept({ id: inv.id, mentor_id: inv.mentor_id })}
                      className="h-8 px-4 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all"
                    >
                      הצטרף
                    </button>
                    <button
                      onClick={() => onDecline(inv.id)}
                      className="h-8 w-8 flex items-center justify-center border border-border text-muted-foreground rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                      title="מחק הזמנה"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── State 3: no communities, no invites ── */}
          {!hasCommunities && !hasInvites && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Bell className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1.5">טרם קיבלת הזמנה לקהילה</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                בקרוב תקבל הזמנה ממנטור לקהילת המסחר שלו. ברגע שתאושר — תוכל להיכנס לשיעורים ולקהילה.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      <button
        onClick={onSignOut}
        className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        התנתק ({userEmail})
      </button>
    </div>
  );
}

// ─── Lesson Quiz Button ───────────────────────────────────────────────────────
function LessonQuizButton({ lessonId, mentorId, onTakeQuiz, studentId }: { lessonId: string; mentorId: string; onTakeQuiz: (quizId: string) => void; studentId: string }) {
  const navigate = useNavigate();
  const { data: quiz, isLoading } = useQuery({
    queryKey: ['student-lesson-quiz-btn', lessonId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quizzes')
        .select('id, title, description, is_published')
        .eq('mentor_id', mentorId)
        .eq('lesson_id', lessonId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!lessonId && !!mentorId,
  });

  const { data: submission } = useQuery({
    queryKey: ['student-lesson-quiz-submission', quiz?.id, studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_submissions')
        .select('id, score, max_score')
        .eq('quiz_id', quiz!.id)
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!quiz?.id && !!studentId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  if (isLoading || !quiz) return null;

  const hasSubmitted = !!submission;
  const pct = submission?.score != null && submission?.max_score != null && submission.max_score > 0
    ? (submission.max_score === 100 ? submission.score : Math.round((submission.score / submission.max_score) * 100))
    : null;

  return (
    <div className="px-6 pb-4 mt-4">
      <div className={`flex items-center gap-4 p-4 rounded-xl border ${hasSubmitted ? 'bg-accent/5 border-accent/20' : 'bg-primary/5 border-primary/20'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasSubmitted ? 'bg-accent/10' : 'bg-primary/10'}`}>
          {hasSubmitted ? <CheckCircle2 className="w-5 h-5 text-accent" /> : <ClipboardList className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">מבחן: {quiz.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasSubmitted
              ? pct != null ? `ציון: ${pct}/100` : 'המבחן הוגש בהצלחה'
              : quiz.description || 'בחן את עצמך על חומר השיעור'}
          </p>
        </div>
        <button
          onClick={() => {
            if (hasSubmitted) {
              navigate(`/quiz/${quiz.id}?review=true`);
            } else {
              onTakeQuiz(quiz.id);
            }
          }}
          className={`h-9 px-4 rounded-xl text-sm font-medium hover:opacity-90 transition-all shrink-0 flex items-center gap-1.5 ${
            hasSubmitted ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground'
          }`}
        >
          {hasSubmitted ? (
            <><Eye className="w-4 h-4" />צפה בתוצאות</>
          ) : (
            'התחל מבחן'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function StudentDashboard() {
  const { user, signOut } = useAuth();

  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SidebarTab>('lessons');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const [lessonViewMode, setLessonViewMode] = useState<LessonViewMode>(null);

  // Date filter state
  const [lessonDateRange, setLessonDateRange] = useState<DateRange | undefined>(undefined);
  const [communityDateRange, setCommunityDateRange] = useState<DateRange | undefined>(undefined);

  // Community dropdown state
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const communityDropdownRef = useRef<HTMLDivElement>(null);

  // Profile popover state
  const [profileOpen, setProfileOpen] = useState(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '' });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [notifyState, setNotifyState] = useState({ notify_sms: false, notify_email: false });
  const [activeLiveSession, setActiveLiveSession] = useState<{ id: string; title: string; mentor_id: string } | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: invites = [], isLoading: invitesLoading } = useQuery<InviteItem[]>({
    queryKey: ['student-invites', user?.id, user?.email],
    queryFn: async () => {
      // Match by student_id OR by contact email/phone (fallback for existing users)
      const orFilter = [
        `student_id.eq.${user!.id}`,
        user?.email ? `contact.eq.${user.email}` : null,
      ].filter(Boolean).join(',');

      const { data, error } = await supabase
        .from('community_invites')
        .select('id, mentor_id, contact, status')
        .or(orFilter)
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

  const { data: profile, isLoading: profileLoading } = useQuery<ProfileItem | null>({
    queryKey: ['student-profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user!.id).single();
      return data ?? null;
    },
    enabled: !!user,
  });

  // Sync profile form when data loads
  useEffect(() => {
    if (profile) {
      setProfileForm({ full_name: profile.full_name ?? '', phone: profile.phone ?? '' });
      setNotifyState({ notify_sms: profile.notify_sms ?? false, notify_email: profile.notify_email ?? false });
    }
  }, [profile]);

  // Auto-select if only one community
  useEffect(() => {
    if (membershipsLoading) return;
    if (memberships.length === 1 && !selectedMentorId) {
      setSelectedMentorId(memberships[0].mentor_id);
    }
  }, [memberships, membershipsLoading]);

  const activeMembership = memberships.find(m => m.mentor_id === selectedMentorId);
  const mentorId = activeMembership?.mentor_id ?? null;
  const mentorName = activeMembership?.mentorName ?? null;

  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ['student-categories', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, title').eq('mentor_id', mentorId!).order('position');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!mentorId,
  });

  const { data: lessons = [] } = useQuery<LessonItem[]>({
    queryKey: ['student-lessons', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('id, title, description, lesson_type, video_url, category_id, duration_minutes, attachment_url, attachment_name, created_at')
        .eq('mentor_id', mentorId!)
        .eq('is_published', true)
        .order('position');
      if (error) throw error;
      return (data ?? []) as LessonItem[];
    },
    enabled: !!mentorId,
  });

  // Category access grants for this student
  const { data: categoryAccess = [] } = useQuery<{ category_id: string }[]>({
    queryKey: ['student-category-access', user?.id, mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_category_access')
        .select('category_id')
        .eq('student_id', user!.id)
        .eq('mentor_id', mentorId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!mentorId,
  });

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
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('user_id', p.mentor_id).single();
          return { ...p, mentorName: prof?.full_name ?? 'מנטור' };
        })
      );
      return enriched as PostItem[];
    },
    enabled: !!mentorId && activeTab === 'community',
  });

  // ── Realtime ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mentorId || activeTab !== 'community') return;
    const channel = supabase
      .channel(`community-${mentorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts', filter: `mentor_id=eq.${mentorId}` }, () => {
        qc.invalidateQueries({ queryKey: ['student-posts', mentorId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'community_post_comments' }, (payload) => {
        const postId = (payload.new as { post_id?: string })?.post_id || (payload.old as { post_id?: string })?.post_id;
        if (postId) qc.invalidateQueries({ queryKey: ['student-comments', postId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mentorId, activeTab, qc]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

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

  // Delete invite (student side — decline permanently)
  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('community_invites').update({ status: 'declined' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-invites'] }),
    onError: () => toast({ title: 'שגיאה במחיקת ההזמנה', variant: 'destructive' }),
  });

  const addComment = useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      const { error } = await supabase.from('community_post_comments').insert({ post_id: postId, author_id: user!.id, content });
      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      qc.invalidateQueries({ queryKey: ['student-comments', postId] });
      setCommentTexts(prev => ({ ...prev, [postId]: '' }));
    },
    onError: () => toast({ title: 'שגיאה בשליחת תגובה', variant: 'destructive' }),
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profiles').update({
        full_name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim() || null,
      }).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-profile'] });
      toast({ title: 'הפרופיל עודכן!' });
      setProfileOpen(false);
    },
    onError: () => toast({ title: 'שגיאה בשמירת הפרופיל', variant: 'destructive' }),
  });

  const savePassword = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'הסיסמה עודכנה בהצלחה!' });
      setNewPassword('');
    },
    onError: () => toast({ title: 'שגיאה בעדכון הסיסמה', variant: 'destructive' }),
  });

  const saveNotifications = useMutation({
    mutationFn: async (prefs: { notify_sms: boolean; notify_email: boolean }) => {
      const { error } = await supabase.from('profiles').update(prefs).eq('user_id', user!.id);
      if (error) throw error;
      return prefs;
    },
    onMutate: (prefs) => {
      // Optimistic update
      setNotifyState(prefs);
    },
    onSuccess: (prefs) => {
      setNotifyState(prefs);
      qc.invalidateQueries({ queryKey: ['student-profile'] });
      toast({ title: 'ההעדפות נשמרו!' });
    },
    onError: () => {
      // Revert on error
      setNotifyState({ notify_sms: profile?.notify_sms ?? false, notify_email: profile?.notify_email ?? false });
      toast({ title: 'שגיאה בשמירת ההעדפות', variant: 'destructive' });
    },
  });

  const uploadAvatar = async (file: File) => {
    setIsAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user!.id}.${ext}`;
      const { data, error } = await supabase.storage.from('lesson-assets').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('lesson-assets').getPublicUrl(data.path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('user_id', user!.id);
      qc.invalidateQueries({ queryKey: ['student-profile'] });
      toast({ title: 'תמונת פרופיל עודכנה!' });
    } catch {
      toast({ title: 'שגיאה בהעלאת התמונה', variant: 'destructive' });
    } finally {
      setIsAvatarUploading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const fetchComments = async (postId: string): Promise<PostComment[]> => {
    const { data, error } = await supabase.from('community_post_comments').select('*').eq('post_id', postId).order('created_at');
    if (error) throw error;
    const enriched = await Promise.all(
      (data ?? []).map(async (c) => {
        const [{ data: prof }, cmRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('user_id', c.author_id).single(),
          mentorId
            ? supabase.from('community_members').select('display_name').eq('mentor_id', mentorId).eq('student_id', c.author_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const dn = (cmRes.data as any)?.display_name;
        return { ...c, profiles: dn ? { full_name: dn } : prof };
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

  const getProgress = (lessonId: string) => progress.find(p => p.lesson_id === lessonId);
  const selectedLessonData = lessons.find(l => l.id === selectedLesson);

  const typeIcon = (type: string) => {
    if (type === 'zoom_recording') return <Film className="w-3.5 h-3.5 text-primary" />;
    if (type === 'resource') return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
    if (type === 'live') return <Radio className="w-3.5 h-3.5 text-destructive" />;
    return <Video className="w-3.5 h-3.5 text-accent" />;
  };

  const postTypeLabel: Record<string, string> = { discussion: 'דיון', media: 'מדיה', live: 'לייב' };
  const postTypeBg: Record<string, string> = { discussion: 'bg-blue-500/10', media: 'bg-emerald-500/10', live: 'bg-red-500/10' };
  const postTypeColor: Record<string, string> = { discussion: 'text-blue-500', media: 'text-emerald-500', live: 'text-red-500' };
  const postTypeIcon = (type: string) => {
    if (type === 'live') return <Wifi className="w-3.5 h-3.5" />;
    if (type === 'media') return <Image className="w-3.5 h-3.5" />;
    return <MessageCircle className="w-3.5 h-3.5" />;
  };
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ── Date-filter helpers ─────────────────────────────────────────────────────
  const isInDateRange = (iso: string, range: DateRange | undefined): boolean => {
    if (!range?.from) return true;
    const d = parseISO(iso);
    const from = startOfDay(range.from);
    const to = endOfDay(range.to ?? range.from);
    return isWithinInterval(d, { start: from, end: to });
  };

  // Filtered lessons (by date range)
  const filteredLessons = useMemo(() =>
    lessonDateRange?.from
      ? lessons.filter(l => isInDateRange(l.created_at, lessonDateRange))
      : lessons
  , [lessons, lessonDateRange]);

  // Filtered posts (by date range)
  const filteredPosts = useMemo(() =>
    communityDateRange?.from
      ? posts.filter(p => isInDateRange(p.created_at, communityDateRange))
      : posts
  , [posts, communityDateRange]);

  // Group filtered posts by date (day label)
  const postsByDay = useMemo(() => {
    const groups: { label: string; posts: typeof filteredPosts }[] = [];
    let lastLabel = '';
    // posts are ordered desc; group them
    const sorted = [...filteredPosts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    // re-sort desc for display, then group
    const desc = [...sorted].reverse();
    for (const post of desc) {
      const label = format(parseISO(post.created_at), 'dd.MM.yyyy', { locale: he });
      if (label !== lastLabel) {
        groups.push({ label, posts: [post] });
        lastLabel = label;
      } else {
        groups[groups.length - 1].posts.push(post);
      }
    }
    return groups;
  }, [filteredPosts]);

  // ── Loading ──
  if (membershipsLoading || invitesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Landing screen ──
  if (!selectedMentorId) {
    return (
      <LandingScreen
        memberships={memberships}
        invites={invites}
        onSelect={setSelectedMentorId}
        onAccept={(inv) => acceptInvite.mutate(inv)}
        onDecline={(id) => deleteInvite.mutate(id)}
        onSignOut={signOut}
        userEmail={user?.email}
      />
    );
  }

  // ── Full Dashboard ──
  return (
    <div className="flex h-screen bg-background overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-l border-sidebar-border flex flex-col shrink-0 h-full">
        <AnimatePresence mode="wait">
          {lessonViewMode ? (
            /* ── Lesson View Mode Sidebar ── */
            <motion.div
              key="lesson-sidebar"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col h-full"
            >
              {/* Back button header */}
              <div className="p-4 border-b border-sidebar-border">
                <button
                  onClick={() => { setLessonViewMode(null); setSelectedLesson(null); }}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity mb-3"
                >
                  <ChevronLeft className="w-4 h-4" />
                  חזור לתפריט הראשי
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-sidebar-foreground truncate">{lessonViewMode.categoryTitle}</h3>
                </div>
              </div>

              {/* Lesson list */}
              <div className="flex-1 overflow-y-auto py-2">
                {(() => {
                  const catLessons = lessons.filter(l => l.category_id === lessonViewMode.categoryId);
                  if (catLessons.length === 0) return (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">אין שיעורים בקטגוריה זו</div>
                  );
                  return catLessons.map((lesson, idx) => {
                    const prog = getProgress(lesson.id);
                    const isSelected = selectedLesson === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => setSelectedLesson(isSelected ? null : lesson.id)}
                        className={`w-full text-start flex items-start gap-3 px-4 py-3 transition-all hover:bg-sidebar-accent/60 ${
                          isSelected ? 'bg-sidebar-accent border-e-2 border-primary' : ''
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          {prog?.completed
                            ? <CheckCircle2 className="w-5 h-5 text-accent" />
                            : <span className="text-xs font-bold text-muted-foreground">{idx + 1}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-tight truncate ${isSelected ? 'text-primary' : 'text-sidebar-foreground'}`}>
                            {lesson.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {lesson.duration_minutes && (
                              <span className="text-[10px] text-muted-foreground">{lesson.duration_minutes} דק'</span>
                            )}
                            {lesson.attachment_url && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/70">
                                <Paperclip className="w-2.5 h-2.5" />צירוף
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Bottom user chip */}
              <div className="p-3 border-t border-sidebar-border relative" ref={profilePopoverRef}>
                <button
                  onClick={() => setProfileOpen(v => !v)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold overflow-hidden shrink-0">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      : user?.email?.[0]?.toUpperCase()
                    }
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-xs font-medium text-foreground truncate">{profile?.full_name || user?.email}</div>
                    <div className="text-[10px] text-muted-foreground">הגדרות פרופיל</div>
                  </div>
                  <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
                {profileOpen && <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />}
                <AnimatePresence>
                  {profileOpen && <InlineProfilePopover profile={profile} user={user} profileForm={profileForm} setProfileForm={setProfileForm} newPassword={newPassword} setNewPassword={setNewPassword} showPassword={showPassword} setShowPassword={setShowPassword} isAvatarUploading={isAvatarUploading} avatarInputRef={avatarInputRef} notifyState={notifyState} saveProfile={saveProfile} savePassword={savePassword} saveNotifications={saveNotifications} uploadAvatar={uploadAvatar} signOut={signOut} onClose={() => setProfileOpen(false)} />}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            /* ── Normal Sidebar ── */
            <motion.div
              key="main-sidebar"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col h-full"
            >
              <div className="p-5 border-b border-sidebar-border">
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="flex items-center gap-3 w-full text-right hover:opacity-75 transition-opacity cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-sidebar-foreground">TradeLearn</div>
                    <div className="text-xs text-muted-foreground">תלמיד</div>
                  </div>
                </button>
              </div>

              {mentorName && (
                <div className="px-3 py-2 border-b border-sidebar-border relative">
                  <button
                    onClick={() => setCommunityDropdownOpen(v => !v)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-right hover:bg-sidebar-accent cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{mentorName.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground leading-tight">קהילה נוכחית</p>
                      <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight mt-0.5">{mentorName}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${communityDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {communityDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCommunityDropdownOpen(false)} />
                      <div className="absolute left-3 right-3 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                        {memberships.map((m) => (
                          <button
                            key={m.mentor_id}
                            onClick={() => {
                              setSelectedMentorId(m.mentor_id);
                              setCommunityDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-right transition-colors hover:bg-accent ${m.mentor_id === selectedMentorId ? 'bg-accent/60' : ''}`}
                          >
                            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{m.mentorName.charAt(0)}</span>
                            </div>
                            <span className="text-sm font-medium text-foreground truncate flex-1">{m.mentorName}</span>
                            {m.mentor_id === selectedMentorId && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <nav className="flex-1 p-3 space-y-1">
                {([
                  { key: 'lessons', label: 'שיעורים', icon: BookOpen },
                  { key: 'community', label: 'קהילה', icon: Users },
                  { key: 'live', label: 'לייב', icon: Radio },
                  { key: 'questions', label: 'השאלות שלי', icon: MessageCircleQuestion },
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

              {/* ── Bottom user chip (opens profile popover) ── */}
              <div className="p-3 border-t border-sidebar-border relative" ref={profilePopoverRef}>
                <button
                  onClick={() => setProfileOpen(v => !v)}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold overflow-hidden shrink-0">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      : user?.email?.[0]?.toUpperCase()
                    }
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-xs font-medium text-foreground truncate">{profile?.full_name || user?.email}</div>
                    <div className="text-[10px] text-muted-foreground">הגדרות פרופיל</div>
                  </div>
                  <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
                {profileOpen && <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />}
                <AnimatePresence>
                  {profileOpen && <InlineProfilePopover profile={profile} user={user} profileForm={profileForm} setProfileForm={setProfileForm} newPassword={newPassword} setNewPassword={setNewPassword} showPassword={showPassword} setShowPassword={setShowPassword} isAvatarUploading={isAvatarUploading} avatarInputRef={avatarInputRef} notifyState={notifyState} saveProfile={saveProfile} savePassword={savePassword} saveNotifications={saveNotifications} uploadAvatar={uploadAvatar} signOut={signOut} onClose={() => setProfileOpen(false)} />}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ──────── LESSONS ──────── */}
          {activeTab === 'lessons' && (
            <motion.div key={lessonViewMode ? `lesson-view-${selectedLesson}` : 'lessons'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8">

              {/* ── Lesson View Mode (player only, category list in sidebar) ── */}
              {lessonViewMode ? (
                <AnimatePresence mode="wait">
                  {selectedLessonData ? (
                    <motion.div
                      key={selectedLessonData.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="bg-card rounded-xl card-shadow overflow-hidden"
                    >
                      <div className="aspect-video bg-foreground/5 border-b border-border flex items-center justify-center">
                        {selectedLessonData.video_url ? (
                          <VideoPlayer
                            src={selectedLessonData.video_url}
                            lessonId={selectedLessonData.id}
                            studentId={user!.id}
                            initialProgress={getProgress(selectedLessonData.id)}
                            onComplete={() => qc.invalidateQueries({ queryKey: ['progress', user?.id] })}
                          />
                        ) : selectedLessonData.lesson_type === 'live' ? (
                          <div className="text-center space-y-2">
                            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                              <Radio className="w-6 h-6 text-destructive" />
                            </div>
                            <p className="text-sm font-medium text-foreground">שיעור לייב מוקלט</p>
                            <p className="text-xs text-muted-foreground">הקלטת הלייב תופיע כאן לאחר עיבוד</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Video className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-40" />
                            <p className="text-sm text-muted-foreground">אין קובץ וידאו</p>
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <h2 className="text-xl font-bold text-foreground">{selectedLessonData.title}</h2>
                          <div className="flex items-center gap-2 shrink-0">
                            {getProgress(selectedLessonData.id)?.completed && (
                              <div className="flex items-center gap-1.5 text-accent text-sm font-medium">
                                <CheckCircle2 className="w-4 h-4" />הושלם
                              </div>
                            )}
                          </div>
                        </div>
                        {selectedLessonData.description && (
                          <p className="text-sm text-muted-foreground mt-2">{selectedLessonData.description}</p>
                        )}
                        {selectedLessonData.duration_minutes && (
                          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" /><span>{selectedLessonData.duration_minutes} דקות</span>
                          </div>
                        )}
                      </div>
                      {/* Inline attachment viewer */}
                      {selectedLessonData.attachment_url && (
                        <AttachmentViewer url={selectedLessonData.attachment_url} name={selectedLessonData.attachment_name ?? ''} />
                      )}
                      {/* Quiz button */}
                      <LessonQuizButton lessonId={selectedLessonData.id} mentorId={mentorId!} studentId={user!.id} onTakeQuiz={(quizId) => navigate(`/quiz/${quizId}`)} />
                      {/* Q&A section */}
                      {mentorId && (
                        <div className="px-6 pb-6">
                          <LessonQA
                            lessonId={selectedLessonData.id}
                            mentorId={mentorId}
                            studentId={user!.id}
                            studentName={profile?.full_name || user?.email || 'תלמיד'}
                            isMentor={false}
                          />
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="text-center py-24 text-muted-foreground">
                      <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">בחר שיעור מהרשימה</p>
                      <p className="text-sm mt-1">לחץ על שיעור בסרגל הצד כדי לצפות בו</p>
                    </div>
                  )}
                </AnimatePresence>
              ) : (
                <>
              <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">הקורסים שלי</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {filteredLessons.length} שיעורים זמינים · {progress.filter(p => p.completed).length} הושלמו
                    {lessonDateRange?.from && <span className="mr-2 text-primary font-medium">· מסונן לפי תאריך</span>}
                  </p>
                </div>
                {/* Date range filter */}
                <DateRangeFilter range={lessonDateRange} onChange={setLessonDateRange} />
              </div>




              <div className="space-y-3">
                {categories.map((cat) => {
                  // If there are specific grants and this category is not in them → hide
                  const hasSpecificGrants = categoryAccess.length > 0;
                  const hasAccessToCat = !hasSpecificGrants || categoryAccess.some(g => g.category_id === cat.id);
                  if (!hasAccessToCat) return null;

                  const catLessons = filteredLessons.filter(l => l.category_id === cat.id);
                  if (catLessons.length === 0) return null;
                  const isExpanded = expandedCats.has(cat.id);
                  
                  return (
                    <div key={cat.id} className="bg-card rounded-xl card-shadow overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleCat(cat.id)}
                      >
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        <span className="font-semibold text-foreground flex-1">{cat.title}</span>
                        <span className="text-xs text-muted-foreground">{catLessons.length} שיעורים</span>
                      </div>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="border-t border-border">
                              {catLessons.map((lesson) => {
                                return (
                                   <div
                                    key={lesson.id}
                                    onClick={() => {
                                      setLessonViewMode({ categoryId: cat.id, categoryTitle: cat.title });
                                      setSelectedLesson(lesson.id);
                                    }}
                                    className="flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                  >
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                                      {typeIcon(lesson.lesson_type)}
                                    </div>
                                    <span className={`text-sm flex-1 ${selectedLesson === lesson.id ? 'font-medium text-accent' : 'text-foreground'}`}>
                                      {lesson.title}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/70 shrink-0">
                                      {format(parseISO(lesson.created_at), 'dd.MM.yy', { locale: he })}
                                    </span>
                                    {lesson.lesson_type === 'live' && (
                                       <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold shrink-0 tracking-wide">
                                         <Radio className="w-2.5 h-2.5" />
                                         הוקלט בלייב
                                       </span>
                                     )}
                                    {lesson.attachment_url && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-medium shrink-0">
                                        <Paperclip className="w-2.5 h-2.5" />
                                        צירוף
                                      </span>
                                    )}
                                    {lesson.duration_minutes && (
                                      <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
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

                {filteredLessons.filter(l => !l.category_id).map((lesson) => {
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
                      <span className="text-[10px] text-muted-foreground/70">
                        {format(parseISO(lesson.created_at), 'dd.MM.yy', { locale: he })}
                      </span>
                      {lesson.duration_minutes && (
                        <span className="text-xs text-muted-foreground tabular">{lesson.duration_minutes} דק'</span>
                      )}
                    </motion.div>
                  );
                })}

                {filteredLessons.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    {lessonDateRange?.from ? (
                      <>
                        <p className="font-medium">לא נמצאו שיעורים בתקופה שנבחרה</p>
                        <button
                          onClick={() => setLessonDateRange(undefined)}
                          className="mt-2 text-sm text-primary hover:opacity-80 transition-opacity"
                        >
                          נקה סינון
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">עדיין אין תכנים</p>
                        <p className="text-sm mt-1">המנטור שלך יעלה תכנים בקרוב.</p>
                      </>
                    )}
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
              <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">קהילה</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mentorName ? `עדכונים מ${mentorName}` : 'עדכונים מהמנטור שלך'}
                    {communityDateRange?.from && <span className="mr-2 text-primary font-medium">· מסונן לפי תאריך</span>}
                  </p>
                </div>
                <DateRangeFilter range={communityDateRange} onChange={setCommunityDateRange} />
              </div>

              {posts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">אין עדכונים עדיין</p>
                  <p className="text-sm mt-1">המנטור שלך יפרסם עדכונים בקרוב</p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">לא נמצאו פוסטים בתקופה שנבחרה</p>
                  <button
                    onClick={() => setCommunityDateRange(undefined)}
                    className="mt-2 text-sm text-primary hover:opacity-80 transition-opacity"
                  >
                    נקה סינון
                  </button>
                </div>
              ) : (
                <div className="space-y-0">
                  {postsByDay.map((group, gi) => (
                    <div key={group.label}>
                      {/* Day separator */}
                      <div className={`flex items-center gap-3 ${gi > 0 ? 'mt-6' : ''} mb-4`}>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted/50 rounded-full border border-border shrink-0">
                          {group.label}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <div className="space-y-4">
                        {group.posts.map((post) => (
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
                            onJoinLive={async () => {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const { data } = await (supabase.from('live_sessions') as any)
                                .select('id, title, mentor_id')
                                .eq('mentor_id', post.mentor_id)
                                .eq('status', 'active')
                                .order('started_at', { ascending: false })
                                .limit(1)
                                .single();
                              if (data) setActiveLiveSession(data);
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
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ──────── LIVE ──────── */}
          {activeTab === 'live' && mentorId && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LiveHubStudent
                mentorId={mentorId}
                mentorName={mentorName ?? ''}
                userId={user!.id}
                userName={profile?.full_name || user?.email || 'תלמיד'}
                userProfile={profile}
              />
            </motion.div>
          )}

          {activeTab === 'live' && !mentorId && (
            <motion.div key="live-no-mentor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 text-center text-muted-foreground">
              <Radio className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">לא נבחרה קהילה</p>
            </motion.div>
          )}

          {/* ──────── MY QUESTIONS ──────── */}
          {activeTab === 'questions' && mentorId && user && (
            <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <StudentMyQuestions
                studentId={user.id}
                mentorId={mentorId}
                onGoToLesson={(lessonId) => {
                  const lesson = lessons.find(l => l.id === lessonId);
                  if (!lesson) return;
                  const cat = lesson.category_id ? categories.find(c => c.id === lesson.category_id) : null;
                  setLessonViewMode({ categoryId: lesson.category_id ?? '', categoryTitle: cat?.title ?? 'שיעורים' });
                  setSelectedLesson(lessonId);
                  setActiveTab('lessons');
                }}
              />
            </motion.div>
          )}

          {activeTab === 'questions' && !mentorId && (
            <motion.div key="questions-no-mentor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 text-center text-muted-foreground">
              <MessageCircleQuestion className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">לא נבחרה קהילה</p>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Live Viewer Modal */}
      <AnimatePresence>
      {activeLiveSession && (
          <LiveViewer
            sessionId={activeLiveSession.id}
            mentorId={activeLiveSession.mentor_id}
            userId={user!.id}
            userName={profile?.full_name || user?.email || 'תלמיד'}
            sessionTitle={activeLiveSession.title}
            onClose={() => setActiveLiveSession(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── DateRangeFilter ─────────────────────────────────────────────────────────
function DateRangeFilter({ range, onChange }: { range: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!range?.from;

  const label = hasFilter
    ? range?.to && range.to.getTime() !== range.from!.getTime()
      ? `${format(range.from!, 'dd.MM.yy', { locale: he })} – ${format(range.to, 'dd.MM.yy', { locale: he })}`
      : format(range.from!, 'dd.MM.yy', { locale: he })
    : 'סנן לפי תאריך';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-2 h-9 px-3 text-xs ${hasFilter ? 'border-primary text-primary bg-primary/5' : 'text-muted-foreground'}`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {label}
          {hasFilter && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
              className="hover:text-destructive transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={6}>
        <Calendar
          mode="range"
          selected={range}
          onSelect={(r) => {
            onChange(r);
            if (r?.from && r?.to) setOpen(false);
          }}
          className="p-3 pointer-events-auto"
          numberOfMonths={2}
        />
        {hasFilter && (
          <div className="border-t border-border p-2 flex justify-end">
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
            >
              נקה סינון
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── StudentPostCard ──────────────────────────────────────────────────────────
const StudentPostCard = React.forwardRef<HTMLDivElement, {
  post: PostItem;
  fetchComments: (id: string) => Promise<PostComment[]>;
  expanded: boolean;
  onToggleComments: () => void;
  commentText: string;
  onCommentChange: (v: string) => void;
  onAddComment: () => void;
  onJoinLive: () => void;
  postTypeLabel: Record<string, string>;
  postTypeIcon: (t: string) => React.ReactNode;
  postTypeBg: Record<string, string>;
  postTypeColor: Record<string, string>;
  formatDate: (s: string) => string;
  queryClient: ReturnType<typeof useQueryClient>;
}>(({
  post, fetchComments, expanded, onToggleComments,
  commentText, onCommentChange, onAddComment, onJoinLive,
  postTypeLabel, postTypeIcon, postTypeBg, postTypeColor, formatDate, queryClient,
}, ref) => {
  const { data: comments = [], isLoading: commentsLoading } = useQuery<PostComment[]>({
    queryKey: ['student-comments', post.id],
    queryFn: () => fetchComments(post.id),
    enabled: expanded,
  });

  const { lightbox, openLightbox, closeLightbox } = useMediaLightbox();
  const pType = post.post_type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card rounded-2xl card-shadow overflow-hidden ${post.is_pinned ? 'ring-2 ring-primary/20' : ''}`}
    >
      <div className="p-5">
        {post.is_pinned && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-3">
            <Pin className="w-3 h-3" />נעוץ
          </div>
        )}
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

        {/* Live ended with recording */}
        {pType === 'live' && post.media_url && post.media_type === 'video' && (
          <div className="mt-3 rounded-xl overflow-hidden border border-border">
            <div className="px-3 py-1.5 bg-muted/50 border-b border-border flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive/60" />
              <span className="text-xs text-muted-foreground font-medium">הקלטת הלייב</span>
            </div>
            <video src={post.media_url} className="w-full max-h-72 object-contain bg-black rounded-b-xl" controls />
          </div>
        )}

        {/* Non-live media */}
        {pType !== 'live' && post.media_url && (
          <div className="mt-3 rounded-xl overflow-hidden cursor-pointer" onClick={() => openLightbox(post.media_url!, (post.media_type as 'video' | 'image') || 'image')}>
            {post.media_type === 'video'
              ? <video src={post.media_url} className="w-full max-h-72 object-cover rounded-xl" />
              : <img src={post.media_url} alt="post" className="w-full max-h-72 object-cover rounded-xl" />
            }
          </div>
        )}
        {lightbox && <MediaLightbox open={!!lightbox} onOpenChange={closeLightbox} url={lightbox.url} type={lightbox.type} />}

        {/* Join live — only if active (no recording yet) */}
        {pType === 'live' && !post.media_url && !post.content.includes('(הסתיים)') && (
          <button
            onClick={onJoinLive}
            className="mt-3 flex items-center gap-2 h-9 px-4 bg-destructive text-destructive-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground animate-pulse" />
            הצטרף ללייב
          </button>
        )}

        <button
          onClick={onToggleComments}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {expanded ? 'הסתר תגובות' : `תגובות${comments.length > 0 ? ` (${comments.length})` : ''}`}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
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
});
StudentPostCard.displayName = 'StudentPostCard';

// ─── InlineProfilePopover ─────────────────────────────────────────────────────
function InlineProfilePopover({
  profile, user, profileForm, setProfileForm, newPassword, setNewPassword,
  showPassword, setShowPassword, isAvatarUploading, avatarInputRef,
  notifyState, saveProfile, savePassword, saveNotifications,
  uploadAvatar, signOut, onClose,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any; user: any; profileForm: { full_name: string; phone: string };
  setProfileForm: React.Dispatch<React.SetStateAction<{ full_name: string; phone: string }>>;
  newPassword: string; setNewPassword: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: (p: boolean) => boolean) => void;
  isAvatarUploading: boolean; avatarInputRef: React.RefObject<HTMLInputElement | null>;
  notifyState: { notify_sms: boolean; notify_email: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveProfile: any; savePassword: any; saveNotifications: any;
  uploadAvatar: (f: File) => void; signOut: () => void; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full mb-2 right-2 left-2 z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      style={{ maxHeight: '80vh', overflowY: 'auto' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">הפרופיל שלי</span>
        <div className="w-4" />
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <User className="w-6 h-6 text-accent/40" />
              }
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={isAvatarUploading}
              className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all disabled:opacity-50 shadow-md"
            >
              {isAvatarUploading
                ? <div className="w-2.5 h-2.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-3 h-3" />
              }
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{profile?.full_name || 'תלמיד'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">פרטים אישיים</p>
          <div><label className="block text-xs text-muted-foreground mb-1">שם מלא</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={profileForm.full_name} onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))} placeholder="השם שלך"
                className="w-full h-9 pr-9 pl-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right" />
            </div>
          </div>
          <div><label className="block text-xs text-muted-foreground mb-1">מספר טלפון</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="050-0000000" type="tel"
                className="w-full h-9 pr-9 pl-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right" />
            </div>
          </div>
          <div><label className="block text-xs text-muted-foreground mb-1">אימייל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={user?.email ?? ''} disabled className="w-full h-9 pr-9 pl-3 bg-muted ring-1 ring-border rounded-lg text-xs text-muted-foreground cursor-not-allowed text-right" />
            </div>
          </div>
          <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending || !profileForm.full_name.trim()}
            className="w-full h-9 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
            {saveProfile.isPending ? 'שומר...' : 'שמור פרטים'}
          </button>
        </div>
        <div className="space-y-2.5 pt-1 border-t border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">שינוי סיסמה</p>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="סיסמה חדשה (6+ תווים)"
              className="w-full h-9 pr-9 pl-9 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right" />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button onClick={() => savePassword.mutate()} disabled={savePassword.isPending || newPassword.length < 6}
            className="w-full h-9 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
            {savePassword.isPending ? 'מעדכן...' : 'עדכן סיסמה'}
          </button>
        </div>
        <div className="space-y-2.5 pt-1 border-t border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-1">התראות ועדכונים</p>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-foreground">SMS / נייד</span></div>
            <Switch checked={notifyState.notify_sms} onCheckedChange={(val) => saveNotifications.mutate({ notify_sms: val, notify_email: notifyState.notify_email })} disabled={saveNotifications.isPending} />
          </div>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-xs text-foreground">אימייל</span></div>
            <Switch checked={notifyState.notify_email} onCheckedChange={(val) => saveNotifications.mutate({ notify_sms: notifyState.notify_sms, notify_email: val })} disabled={saveNotifications.isPending} />
          </div>
        </div>
        <div className="pt-1 border-t border-border">
          <button onClick={signOut} className="w-full flex items-center justify-center gap-2 h-9 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all">
            <LogOut className="w-3.5 h-3.5" />התנתק
          </button>
        </div>
      </div>
    </motion.div>
  );
}
