import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircleQuestion, Lock, Globe, BookOpen, Send, X, ChevronDown,
  Clock, Check, Reply, Pencil,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  mentorId: string;
}

interface PrivateQuestion {
  id: string;
  student_id: string;
  lesson_id: string | null;
  question: string;
  answer: string | null;
  answered_at: string | null;
  updated_at: string;
  created_at: string;
  studentName?: string;
  lessonTitle?: string;
}

interface LessonQuestion {
  id: string;
  lesson_id: string;
  student_id: string;
  content: string;
  created_at: string;
  studentName?: string;
  lessonTitle?: string;
  answers?: { id: string; content: string; created_at: string; updated_at?: string }[];
}

type SectionTab = 'private' | 'lesson';

export default function MentorQuestionsHub({ mentorId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [section, setSection] = useState<SectionTab>('private');
  const [expandedPrivate, setExpandedPrivate] = useState<string | null>(null);
  const [privateAnswerText, setPrivateAnswerText] = useState<Record<string, string>>({});
  const [editingPrivateAnswer, setEditingPrivateAnswer] = useState<string | null>(null);
  const [editingPrivateText, setEditingPrivateText] = useState('');
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [lessonAnswerText, setLessonAnswerText] = useState<Record<string, string>>({});
  const [editingLessonAnswer, setEditingLessonAnswer] = useState<string | null>(null);
  const [editingLessonAnswerText, setEditingLessonAnswerText] = useState('');

  // ── Private Questions ─────────────────────────────────────────────────────
  const { data: privateQuestions = [] } = useQuery<PrivateQuestion[]>({
    queryKey: ['mentor-private-questions', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('private_questions')
        .select('*')
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (q) => {
          const [{ data: sp }, { data: cm }, lessonRes] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('user_id', q.student_id).single(),
            supabase.from('community_members').select('display_name').eq('mentor_id', mentorId).eq('student_id', q.student_id).maybeSingle(),
            q.lesson_id
              ? supabase.from('lessons').select('title').eq('id', q.lesson_id).single()
              : Promise.resolve({ data: null }),
          ]);
          return { ...q, studentName: (cm as any)?.display_name || (sp?.full_name ?? 'תלמיד'), lessonTitle: (lessonRes.data as { title?: string } | null)?.title ?? null };
        })
      );
      return enriched as PrivateQuestion[];
    },
  });

  // ── Lesson Questions ──────────────────────────────────────────────────────
  const { data: lessonQuestions = [] } = useQuery<LessonQuestion[]>({
    queryKey: ['mentor-lesson-questions', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_questions')
        .select('*')
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (q) => {
          const [{ data: sp }, { data: cm }, { data: lp }, { data: answers }] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('user_id', q.student_id).single(),
            supabase.from('community_members').select('display_name').eq('mentor_id', mentorId).eq('student_id', q.student_id).maybeSingle(),
            supabase.from('lessons').select('title').eq('id', q.lesson_id).single(),
            supabase.from('lesson_question_answers').select('id, content, created_at, updated_at').eq('question_id', q.id).order('created_at'),
          ]);
          return {
            ...q,
            studentName: (cm as any)?.display_name || sp?.full_name ?? 'תלמיד',
            lessonTitle: lp?.title ?? 'שיעור',
            answers: answers ?? [],
          };
        })
      );
      return enriched as LessonQuestion[];
    },
  });

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`mentor-questions-${mentorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_questions', filter: `mentor_id=eq.${mentorId}` }, () => {
        qc.invalidateQueries({ queryKey: ['mentor-private-questions', mentorId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_questions', filter: `mentor_id=eq.${mentorId}` }, () => {
        qc.invalidateQueries({ queryKey: ['mentor-lesson-questions', mentorId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_question_answers' }, () => {
        qc.invalidateQueries({ queryKey: ['mentor-lesson-questions', mentorId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mentorId, qc]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const answerPrivate = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: string }) => {
      const { error } = await supabase
        .from('private_questions')
        .update({ answer, answered_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['mentor-private-questions', mentorId] });
      setPrivateAnswerText(prev => ({ ...prev, [id]: '' }));
      toast({ title: 'תשובה נשלחה לתלמיד!' });
    },
    onError: () => toast({ title: 'שגיאה בשליחת תשובה', variant: 'destructive' }),
  });

  const editPrivateAnswer = useMutation({
    mutationFn: async ({ id, answer }: { id: string; answer: string }) => {
      const { error } = await supabase
        .from('private_questions')
        .update({ answer, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-private-questions', mentorId] });
      setEditingPrivateAnswer(null);
      toast({ title: 'התשובה עודכנה!' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון תשובה', variant: 'destructive' }),
  });

  const answerLesson = useMutation({
    mutationFn: async ({ questionId, content }: { questionId: string; content: string }) => {
      const { error } = await supabase
        .from('lesson_question_answers')
        .insert({ question_id: questionId, mentor_id: mentorId, content });
      if (error) throw error;
    },
    onSuccess: (_, { questionId }) => {
      qc.invalidateQueries({ queryKey: ['mentor-lesson-questions', mentorId] });
      setLessonAnswerText(prev => ({ ...prev, [questionId]: '' }));
      toast({ title: 'תשובה פורסמה!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום תשובה', variant: 'destructive' }),
  });

  const editLessonAnswer = useMutation({
    mutationFn: async ({ answerId, content }: { answerId: string; content: string }) => {
      const { error } = await supabase
        .from('lesson_question_answers')
        .update({ content })
        .eq('id', answerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-lesson-questions', mentorId] });
      setEditingLessonAnswer(null);
      toast({ title: 'התשובה עודכנה!' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון תשובה', variant: 'destructive' }),
  });

  const deletePrivateQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('private_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentor-private-questions', mentorId] }),
  });

  const deleteLessonQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lesson_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mentor-lesson-questions', mentorId] }),
  });

  const unansweredPrivate = privateQuestions.filter(q => !q.answer).length;
  const unansweredLesson = lessonQuestions.filter(q => !q.answers?.length).length;

  const fmt = (iso: string) => format(parseISO(iso), "d בMMM, HH:mm", { locale: he });

  // helper: was the answer edited after creation?
  const wasEdited = (createdAt: string, updatedAt?: string) => {
    if (!updatedAt) return false;
    return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 3000;
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-8 pt-8 pb-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircleQuestion className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">שאלות</h1>
            <p className="text-sm text-muted-foreground">שאלות פרטיות ושאלות משיעורים</p>
          </div>
        </div>
      </div>

      {/* Two-section split */}
      <div className="flex-1 flex overflow-hidden px-8 pt-6 pb-8 gap-0">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tab bar */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl mb-5 shrink-0 w-fit">
            <button
              onClick={() => setSection('private')}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                section === 'private' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              שאלות פרטיות
              {unansweredPrivate > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {unansweredPrivate}
                </span>
              )}
            </button>
            <button
              onClick={() => setSection('lesson')}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                section === 'lesson' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              שאלות משיעורים
              {unansweredLesson > 0 && (
                <span className="w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                  {unansweredLesson}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">

              {/* ── Private Questions ── */}
              {section === 'private' && (
                <motion.div
                  key="private"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-3 pr-1"
                >
                  {privateQuestions.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">אין שאלות פרטיות</p>
                      <p className="text-sm mt-1">כשתלמיד ישלח שאלה פרטית — היא תופיע כאן</p>
                    </div>
                  ) : privateQuestions.map(q => {
                    const isOpen = expandedPrivate === q.id;
                    const hasAnswer = !!q.answer;
                    const isEditingThis = editingPrivateAnswer === q.id;
                    const answerEdited = hasAnswer && wasEdited(q.answered_at ?? q.created_at, q.updated_at);
                    return (
                      <div
                        key={q.id}
                        className={`bg-card rounded-xl border transition-all overflow-hidden ${
                          isOpen ? 'border-primary/30 shadow-sm' : 'border-border'
                        } ${!hasAnswer ? 'ring-1 ring-primary/20' : ''}`}
                      >
                        {/* Question header */}
                        <button
                          onClick={() => setExpandedPrivate(isOpen ? null : q.id)}
                          className="w-full flex items-start gap-3 p-4 text-right"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {q.studentName?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <span className="text-sm font-semibold text-foreground">{q.studentName}</span>
                              {q.lessonTitle && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground">
                                  <BookOpen className="w-2.5 h-2.5" />{q.lessonTitle}
                                </span>
                              )}
                              {hasAnswer ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 rounded-full text-[10px] text-accent font-medium">
                                  <Check className="w-2.5 h-2.5" />נענה
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full text-[10px] text-primary font-medium animate-pulse">
                                  ממתין לתשובה
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-1 leading-relaxed line-clamp-2">{q.question}</p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                              <Clock className="w-2.5 h-2.5" />
                              {fmt(q.created_at)}
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        </button>

                        {/* Expanded content */}
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                                {/* Full question */}
                                <div className="bg-muted/50 rounded-lg p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">שאלת התלמיד:</p>
                                  <p className="text-sm text-foreground leading-relaxed">{q.question}</p>
                                </div>

                                {/* Existing answer */}
                                {hasAnswer && !isEditingThis && (
                                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-1">
                                      <button
                                        onClick={() => { setEditingPrivateAnswer(q.id); setEditingPrivateText(q.answer ?? ''); }}
                                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                      >
                                        <Pencil className="w-2.5 h-2.5" />ערוך
                                      </button>
                                      <p className="text-xs font-medium text-accent flex items-center gap-1">
                                        <Check className="w-3 h-3" />התשובה שלך:
                                      </p>
                                    </div>
                                    <p className="text-sm text-foreground leading-relaxed">{q.answer}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {q.answered_at && (
                                        <p className="text-[10px] text-muted-foreground">{fmt(q.answered_at)}</p>
                                      )}
                                      {answerEdited && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                          <Pencil className="w-2 h-2" />נערך
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Edit answer form */}
                                {hasAnswer && isEditingThis && (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editingPrivateText}
                                      onChange={e => setEditingPrivateText(e.target.value)}
                                      rows={3}
                                      className="w-full px-3 py-2 bg-background ring-1 ring-primary rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        onClick={() => setEditingPrivateAnswer(null)}
                                        className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all"
                                      >
                                        ביטול
                                      </button>
                                      <button
                                        onClick={() => {
                                          const txt = editingPrivateText.trim();
                                          if (txt) editPrivateAnswer.mutate({ id: q.id, answer: txt });
                                        }}
                                        disabled={!editingPrivateText.trim() || editPrivateAnswer.isPending}
                                        className="h-8 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                      >
                                        <Check className="w-3 h-3" />שמור
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Answer input */}
                                {!hasAnswer && (
                                  <div className="flex gap-2">
                                    <textarea
                                      value={privateAnswerText[q.id] ?? ''}
                                      onChange={e => setPrivateAnswerText(prev => ({ ...prev, [q.id]: e.target.value }))}
                                      placeholder="כתוב את תשובתך..."
                                      rows={3}
                                      className="flex-1 px-3 py-2 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                                    />
                                    <div className="flex flex-col gap-1.5">
                                      <button
                                        onClick={() => {
                                          const txt = privateAnswerText[q.id]?.trim();
                                          if (txt) answerPrivate.mutate({ id: q.id, answer: txt });
                                        }}
                                        disabled={!privateAnswerText[q.id]?.trim() || answerPrivate.isPending}
                                        className="h-9 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                      >
                                        <Send className="w-3 h-3" />שלח
                                      </button>
                                      <button
                                        onClick={() => deletePrivateQuestion.mutate(q.id)}
                                        className="h-9 px-3 bg-destructive/10 text-destructive rounded-lg text-xs hover:bg-destructive/20 transition-all flex items-center gap-1.5"
                                      >
                                        <X className="w-3 h-3" />מחק
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {hasAnswer && (
                                  <button
                                    onClick={() => deletePrivateQuestion.mutate(q.id)}
                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                                  >
                                    <X className="w-3 h-3" />מחק שאלה
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {/* ── Lesson Questions ── */}
              {section === 'lesson' && (
                <motion.div
                  key="lesson"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="space-y-3 pr-1"
                >
                  {lessonQuestions.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <Globe className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">אין שאלות משיעורים</p>
                      <p className="text-sm mt-1">כשתלמיד ישאל שאלה פומבית בשיעור — היא תופיע כאן</p>
                    </div>
                  ) : lessonQuestions.map(q => {
                    const isOpen = expandedLesson === q.id;
                    const hasAnswers = (q.answers?.length ?? 0) > 0;
                    return (
                      <div
                        key={q.id}
                        className={`bg-card rounded-xl border transition-all overflow-hidden ${
                          isOpen ? 'border-accent/30 shadow-sm' : 'border-border'
                        } ${!hasAnswers ? 'ring-1 ring-accent/20' : ''}`}
                      >
                        <button
                          onClick={() => setExpandedLesson(isOpen ? null : q.id)}
                          className="w-full flex items-start gap-3 p-4 text-right"
                        >
                          <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                            {q.studentName?.[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              <span className="text-sm font-semibold text-foreground">{q.studentName}</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground">
                                <BookOpen className="w-2.5 h-2.5" />{q.lessonTitle}
                              </span>
                              {hasAnswers ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 rounded-full text-[10px] text-accent font-medium">
                                  <Check className="w-2.5 h-2.5" />{q.answers!.length} תשובות
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 rounded-full text-[10px] text-accent font-medium animate-pulse">
                                  ממתין לתשובה
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-1 leading-relaxed line-clamp-2">{q.content}</p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                              <Clock className="w-2.5 h-2.5" />{fmt(q.created_at)}
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        </button>

                        <AnimatePresence>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                                {/* Full question */}
                                <div className="bg-muted/50 rounded-lg p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    שאלה פומבית מ-{q.studentName} בשיעור: <span className="text-foreground font-semibold">{q.lessonTitle}</span>
                                  </p>
                                  <p className="text-sm text-foreground leading-relaxed">{q.content}</p>
                                </div>

                                {/* Existing answers */}
                                {hasAnswers && (
                                  <div className="space-y-2">
                                    {q.answers!.map(a => {
                                      const isEditingAnswer = editingLessonAnswer === a.id;
                                      const edited = wasEdited(a.created_at, a.updated_at);
                                      return (
                                        <div key={a.id} className="bg-accent/5 border border-accent/20 rounded-lg p-3">
                                          {isEditingAnswer ? (
                                            <div className="space-y-2">
                                              <textarea
                                                value={editingLessonAnswerText}
                                                onChange={e => setEditingLessonAnswerText(e.target.value)}
                                                rows={3}
                                                className="w-full px-3 py-2 bg-background ring-1 ring-accent rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-none text-right"
                                              />
                                              <div className="flex gap-2 justify-end">
                                                <button
                                                  onClick={() => setEditingLessonAnswer(null)}
                                                  className="h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all"
                                                >
                                                  ביטול
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    const txt = editingLessonAnswerText.trim();
                                                    if (txt) editLessonAnswer.mutate({ answerId: a.id, content: txt });
                                                  }}
                                                  disabled={!editingLessonAnswerText.trim() || editLessonAnswer.isPending}
                                                  className="h-7 px-3 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                                >
                                                  <Check className="w-3 h-3" />שמור
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <>
                                              <div className="flex items-center justify-between mb-1">
                                                <button
                                                  onClick={() => { setEditingLessonAnswer(a.id); setEditingLessonAnswerText(a.content); }}
                                                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-accent transition-colors"
                                                >
                                                  <Pencil className="w-2.5 h-2.5" />ערוך
                                                </button>
                                                <p className="text-xs font-medium text-accent flex items-center gap-1">
                                                  <Reply className="w-3 h-3" />תשובתך:
                                                </p>
                                              </div>
                                              <p className="text-sm text-foreground leading-relaxed">{a.content}</p>
                                              <div className="flex items-center gap-2 mt-1">
                                                <p className="text-[10px] text-muted-foreground">{fmt(a.created_at)}</p>
                                                {edited && (
                                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                    <Pencil className="w-2 h-2" />נערך
                                                  </span>
                                                )}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Add answer */}
                                <div className="flex gap-2">
                                  <textarea
                                    value={lessonAnswerText[q.id] ?? ''}
                                    onChange={e => setLessonAnswerText(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    placeholder={hasAnswers ? "הוסף תשובה נוספת..." : "כתוב תשובה שכל התלמידים יראו..."}
                                    rows={2}
                                    className="flex-1 px-3 py-2 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-none text-right"
                                  />
                                  <div className="flex flex-col gap-1.5">
                                    <button
                                      onClick={() => {
                                        const txt = lessonAnswerText[q.id]?.trim();
                                        if (txt) answerLesson.mutate({ questionId: q.id, content: txt });
                                      }}
                                      disabled={!lessonAnswerText[q.id]?.trim() || answerLesson.isPending}
                                      className="h-9 px-3 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                      <Send className="w-3 h-3" />פרסם
                                    </button>
                                    <button
                                      onClick={() => deleteLessonQuestion.mutate(q.id)}
                                      className="h-9 px-3 bg-destructive/10 text-destructive rounded-lg text-xs hover:bg-destructive/20 transition-all flex items-center gap-1.5"
                                    >
                                      <X className="w-3 h-3" />מחק
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
