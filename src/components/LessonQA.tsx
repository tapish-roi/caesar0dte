import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircleQuestion, Lock, Globe, Send, X, Reply, Clock, ChevronDown, Check, Pencil,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  lessonId: string;
  mentorId: string;
  studentId: string;
  studentName: string;
  isMentor?: boolean;
}

interface LessonQuestion {
  id: string;
  student_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  studentName?: string;
  avatarLetter?: string;
  answers?: { id: string; content: string; created_at: string; updated_at?: string }[];
}

interface PrivateQuestionsForStudent {
  id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  lessonTitle?: string;
}

export default function LessonQA({ lessonId, mentorId, studentId, studentName, isMentor = false }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newQuestion, setNewQuestion] = useState('');
  const [privateModalOpen, setPrivateModalOpen] = useState(false);
  const [privateQuestion, setPrivateQuestion] = useState('');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});

  // Edit state for mentor answers
  const [editingAnswer, setEditingAnswer] = useState<string | null>(null);
  const [editingAnswerText, setEditingAnswerText] = useState('');

  // Edit state for student questions
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState('');

  // ── Public lesson questions ───────────────────────────────────────────────
  const { data: questions = [] } = useQuery<LessonQuestion[]>({
    queryKey: ['lesson-questions', lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lesson_questions')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (q) => {
          const [{ data: sp }, { data: cm }, { data: answers }] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('user_id', q.student_id).single(),
            supabase.from('community_members').select('display_name').eq('mentor_id', q.mentor_id).eq('student_id', q.student_id).maybeSingle(),
            supabase.from('lesson_question_answers').select('id, content, created_at, updated_at').eq('question_id', q.id).order('created_at'),
          ]);
          const name = (cm as any)?.display_name || (sp?.full_name ?? 'תלמיד');
          return {
            ...q,
            studentName: name,
            avatarLetter: name[0]?.toUpperCase() ?? 'ת',
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
      .channel(`lesson-qa-${lessonId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_questions', filter: `lesson_id=eq.${lessonId}` }, () => {
        qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_question_answers' }, () => {
        qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lessonId, qc]);

  // ── Post public question ──────────────────────────────────────────────────
  const postQuestion = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from('lesson_questions').insert({
        lesson_id: lessonId,
        mentor_id: mentorId,
        student_id: studentId,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      setNewQuestion('');
      toast({ title: 'השאלה פורסמה!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום השאלה', variant: 'destructive' }),
  });

  // ── Edit public question (student) ────────────────────────────────────────
  const editQuestion = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('lesson_questions')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      setEditingQuestion(null);
      toast({ title: 'השאלה עודכנה!' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון השאלה', variant: 'destructive' }),
  });

  // ── Post private question ─────────────────────────────────────────────────
  const postPrivate = useMutation({
    mutationFn: async (question: string) => {
      const { error } = await supabase.from('private_questions').insert({
        student_id: studentId,
        mentor_id: mentorId,
        lesson_id: lessonId,
        question,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPrivateQuestion('');
      setPrivateModalOpen(false);
      toast({ title: 'השאלה הפרטית נשלחה למנטור!' });
    },
    onError: () => toast({ title: 'שגיאה בשליחת השאלה', variant: 'destructive' }),
  });

  // ── Mentor answer to public question ─────────────────────────────────────
  const postAnswer = useMutation({
    mutationFn: async ({ questionId, content }: { questionId: string; content: string }) => {
      const { error } = await supabase.from('lesson_question_answers').insert({
        question_id: questionId,
        mentor_id: mentorId,
        content,
      });
      if (error) throw error;
    },
    onSuccess: (_, { questionId }) => {
      qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      setAnswerTexts(prev => ({ ...prev, [questionId]: '' }));
      toast({ title: 'תשובה פורסמה!' });
    },
    onError: () => toast({ title: 'שגיאה בפרסום תשובה', variant: 'destructive' }),
  });

  // ── Mentor edit answer ────────────────────────────────────────────────────
  const editAnswer = useMutation({
    mutationFn: async ({ answerId, content }: { answerId: string; content: string }) => {
      const { error } = await supabase
        .from('lesson_question_answers')
        .update({ content })
        .eq('id', answerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-questions', lessonId] });
      setEditingAnswer(null);
      toast({ title: 'התשובה עודכנה!' });
    },
    onError: () => toast({ title: 'שגיאה בעדכון תשובה', variant: 'destructive' }),
  });

  const fmt = (iso: string) => format(parseISO(iso), "d בMMM, HH:mm", { locale: he });

  const wasEdited = (createdAt: string, updatedAt?: string) => {
    if (!updatedAt) return false;
    return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 3000;
  };

  return (
    <div className="mt-8 border-t border-border pt-6" dir="rtl">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">שאלות ותשובות</h3>
          {questions.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{questions.length}</span>
          )}
        </div>
        {/* Student action buttons */}
        {!isMentor && (
          <div className="flex gap-2">
            <button
              onClick={() => setPrivateModalOpen(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
            >
              <Lock className="w-3 h-3" />שאלה פרטית
            </button>
            <button
              onClick={() => setNewQuestion(prev => prev === '__focus__' ? '' : '__focus__')}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all"
            >
              <Globe className="w-3 h-3" />שאלה פומבית
            </button>
          </div>
        )}
      </div>

      {/* Public question input (student) */}
      {!isMentor && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-5 overflow-hidden"
          >
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {studentName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  value={newQuestion === '__focus__' ? '' : newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  placeholder="שאל שאלה שכל התלמידים יראו..."
                  className="flex-1 h-9 px-3 bg-muted/50 ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newQuestion.trim() && newQuestion !== '__focus__') {
                      postQuestion.mutate(newQuestion.trim());
                    }
                  }}
                />
                <button
                  onClick={() => { if (newQuestion.trim() && newQuestion !== '__focus__') postQuestion.mutate(newQuestion.trim()); }}
                  disabled={!newQuestion.trim() || newQuestion === '__focus__' || postQuestion.isPending}
                  className="h-9 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />שלח
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Q&A Thread */}
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageCircleQuestion className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">עדיין אין שאלות לשיעור זה</p>
            {!isMentor && <p className="text-xs mt-1">היה הראשון לשאול!</p>}
          </div>
        ) : questions.map(q => {
          const isMe = q.student_id === studentId;
          const isExpanded = expandedQ === q.id;
          const hasAnswers = (q.answers?.length ?? 0) > 0;
          const isEditingThisQ = editingQuestion === q.id;
          const qEdited = wasEdited(q.created_at, q.updated_at);
          return (
            <div key={q.id} className="bg-muted/30 rounded-xl overflow-hidden">
              {/* Question row */}
              {isEditingThisQ ? (
                <div className="p-3 space-y-2">
                  <textarea
                    value={editingQuestionText}
                    onChange={e => setEditingQuestionText(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-background ring-1 ring-primary rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingQuestion(null)}
                      className="h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={() => {
                        const txt = editingQuestionText.trim();
                        if (txt) editQuestion.mutate({ id: q.id, content: txt });
                      }}
                      disabled={!editingQuestionText.trim() || editQuestion.isPending}
                      className="h-7 px-3 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                    >
                      <Check className="w-3 h-3" />שמור
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                  className="w-full flex items-start gap-3 p-3 text-right hover:bg-muted/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-0.5">
                    {q.avatarLetter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{q.studentName}</span>
                      {isMe && <span className="text-[10px] text-muted-foreground">(אתה)</span>}
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />{fmt(q.created_at)}
                      </span>
                      {qEdited && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Pencil className="w-2 h-2" />נערך
                        </span>
                      )}
                      {hasAnswers && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-accent/10 text-accent text-[10px] rounded-full font-medium">
                          <Reply className="w-2.5 h-2.5" />{q.answers!.length} תשובה
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground mt-0.5 leading-relaxed">{q.content}</p>
                    {/* Edit button for own question */}
                    {isMe && !isMentor && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setEditingQuestion(q.id);
                          setEditingQuestionText(q.content);
                        }}
                        className="mt-1 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Pencil className="w-2.5 h-2.5" />ערוך שאלה
                      </button>
                    )}
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                </button>
              )}

              {/* Answers + reply */}
              <AnimatePresence>
                {isExpanded && !isEditingThisQ && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pr-11 pl-3 pb-3 space-y-2">
                      {/* Existing mentor answers */}
                      {q.answers!.map(a => {
                        const isEditingThis = editingAnswer === a.id;
                        const aEdited = wasEdited(a.created_at, a.updated_at);
                        return (
                          <div key={a.id} className="bg-accent/5 border border-accent/15 rounded-lg p-2.5">
                            {isEditingThis ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingAnswerText}
                                  onChange={e => setEditingAnswerText(e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-2 bg-background ring-1 ring-accent rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-none text-right"
                                />
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => setEditingAnswer(null)}
                                    className="h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-all"
                                  >
                                    ביטול
                                  </button>
                                  <button
                                    onClick={() => {
                                      const txt = editingAnswerText.trim();
                                      if (txt) editAnswer.mutate({ answerId: a.id, content: txt });
                                    }}
                                    disabled={!editingAnswerText.trim() || editAnswer.isPending}
                                    className="h-7 px-3 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                  >
                                    <Check className="w-3 h-3" />שמור
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2.5">
                                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0">
                                  <Reply className="w-3 h-3 text-accent-foreground" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[11px] font-semibold text-accent">מנטור</span>
                                    <span className="text-[10px] text-muted-foreground">{fmt(a.created_at)}</span>
                                    {aEdited && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                        <Pencil className="w-2 h-2" />נערך
                                      </span>
                                    )}
                                    {isMentor && (
                                      <button
                                        onClick={() => { setEditingAnswer(a.id); setEditingAnswerText(a.content); }}
                                        className="mr-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-accent transition-colors"
                                      >
                                        <Pencil className="w-2.5 h-2.5" />ערוך
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-sm text-foreground leading-relaxed">{a.content}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Mentor reply input */}
                      {isMentor && (
                        <div className="flex gap-2 pt-1">
                          <input
                            value={answerTexts[q.id] ?? ''}
                            onChange={e => setAnswerTexts(prev => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="כתוב תשובה לכל התלמידים..."
                            className="flex-1 h-8 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                            onKeyDown={e => {
                              if (e.key === 'Enter' && answerTexts[q.id]?.trim()) {
                                postAnswer.mutate({ questionId: q.id, content: answerTexts[q.id].trim() });
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              const txt = answerTexts[q.id]?.trim();
                              if (txt) postAnswer.mutate({ questionId: q.id, content: txt });
                            }}
                            disabled={!answerTexts[q.id]?.trim() || postAnswer.isPending}
                            className="h-8 px-3 bg-accent text-accent-foreground rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            פרסם
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Private Question Modal */}
      <AnimatePresence>
        {privateModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setPrivateModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md" dir="rtl">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setPrivateModalOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" />
                    <h3 className="text-base font-bold text-foreground">שאלה פרטית למנטור</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4 text-right leading-relaxed">
                  השאלה שלך תישלח ישירות למנטור בלבד. התשובה תופיע אצלך תחת "השאלות שלי".
                </p>
                <textarea
                  autoFocus
                  value={privateQuestion}
                  onChange={e => setPrivateQuestion(e.target.value)}
                  placeholder="מה אתה רוצה לשאול..."
                  rows={4}
                  className="w-full px-3 py-2.5 bg-muted/50 ring-1 ring-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right resize-none mb-4"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setPrivateModalOpen(false)}
                    className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={() => { if (privateQuestion.trim()) postPrivate.mutate(privateQuestion.trim()); }}
                    disabled={!privateQuestion.trim() || postPrivate.isPending}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    שלח שאלה פרטית
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
