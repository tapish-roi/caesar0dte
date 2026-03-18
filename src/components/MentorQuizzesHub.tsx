import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, Trash2, Eye, EyeOff, BookOpen, Users,
  ChevronDown, ChevronLeft, X, Check, GripVertical, AlignLeft,
  List, Send, Filter, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  mentorId: string;
  initialLessonId?: string | null; // when navigated from lesson
  onBack?: () => void;
}

type QuestionType = 'multiple_choice' | 'free_text';

interface QuizOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  position: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  position: number;
  options?: QuizOption[];
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  lesson_id: string | null;
  is_published: boolean;
  created_at: string;
  lessonTitle?: string;
  questionCount?: number;
  submissionCount?: number;
}

interface Submission {
  id: string;
  student_id: string;
  score: number | null;
  max_score: number | null;
  submitted_at: string;
  studentName?: string;
  quizTitle?: string;
  quiz_id: string;
}

// ── Draft question builder types ──
interface DraftOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface DraftQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options: DraftOption[];
}

function genId() { return Math.random().toString(36).slice(2); }

const defaultDraftQuestion = (): DraftQuestion => ({
  id: genId(),
  text: '',
  type: 'multiple_choice',
  options: [
    { id: genId(), text: '', isCorrect: false },
    { id: genId(), text: '', isCorrect: false },
    { id: genId(), text: '', isCorrect: false },
    { id: genId(), text: '', isCorrect: false },
  ],
});

// ═══════════════════════════════════════════════════════
// QUIZ BUILDER
// ═══════════════════════════════════════════════════════
function QuizBuilder({
  mentorId,
  lessons,
  initialLessonId,
  editQuizId,
  onDone,
}: {
  mentorId: string;
  lessons: { id: string; title: string }[];
  initialLessonId?: string | null;
  editQuizId?: string | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lessonId, setLessonId] = useState<string>(initialLessonId ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>([defaultDraftQuestion()]);
  const [isSaving, setIsSaving] = useState(false);

  const addQuestion = (type: QuestionType) => {
    const q: DraftQuestion = {
      id: genId(),
      text: '',
      type,
      options: type === 'multiple_choice' ? [
        { id: genId(), text: '', isCorrect: false },
        { id: genId(), text: '', isCorrect: false },
        { id: genId(), text: '', isCorrect: false },
        { id: genId(), text: '', isCorrect: false },
      ] : [],
    };
    setQuestions(prev => [...prev, q]);
  };

  const removeQuestion = (qId: string) => setQuestions(prev => prev.filter(q => q.id !== qId));

  const updateQuestion = (qId: string, patch: Partial<DraftQuestion>) =>
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...patch } : q));

  const updateOption = (qId: string, optId: string, patch: Partial<DraftOption>) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q,
      options: q.options.map(o => o.id === optId ? { ...o, ...patch } : o),
    } : q));

  const setCorrect = (qId: string, optId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q,
      options: q.options.map(o => ({ ...o, isCorrect: o.id === optId })),
    } : q));

  const addOption = (qId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q,
      options: [...q.options, { id: genId(), text: '', isCorrect: false }],
    } : q));

  const removeOption = (qId: string, optId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q,
      options: q.options.filter(o => o.id !== optId),
    } : q));

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) { toast({ title: 'נדרשת כותרת למבחן', variant: 'destructive' }); return; }
    if (questions.some(q => !q.text.trim())) { toast({ title: 'כל השאלות חייבות להיות מלאות', variant: 'destructive' }); return; }
    if (questions.some(q => q.type === 'multiple_choice' && q.options.filter(o => o.text.trim()).length < 2)) {
      toast({ title: 'שאלות אמריקאיות חייבות להכיל לפחות 2 אפשרויות', variant: 'destructive' }); return;
    }

    setIsSaving(true);
    try {
      // Create quiz
      const { data: quiz, error: qErr } = await supabase.from('quizzes').insert({
        mentor_id: mentorId,
        lesson_id: lessonId || null,
        title: title.trim(),
        description: description.trim() || null,
        is_published: publish,
      }).select('id').single();
      if (qErr) throw qErr;

      // Create questions + options
      for (let i = 0; i < questions.length; i++) {
        const dq = questions[i];
        const { data: dbQ, error: qqErr } = await supabase.from('quiz_questions').insert({
          quiz_id: quiz.id,
          question_text: dq.text.trim(),
          question_type: dq.type,
          position: i,
        }).select('id').single();
        if (qqErr) throw qqErr;

        if (dq.type === 'multiple_choice' && dq.options.length > 0) {
          const opts = dq.options
            .filter(o => o.text.trim())
            .map((o, idx) => ({ question_id: dbQ.id, option_text: o.text.trim(), is_correct: o.isCorrect, position: idx }));
          if (opts.length > 0) {
            const { error: oErr } = await supabase.from('quiz_question_options').insert(opts);
            if (oErr) throw oErr;
          }
        }
      }

      qc.invalidateQueries({ queryKey: ['mentor-quizzes', mentorId] });
      toast({ title: publish ? 'המבחן פורסם לתלמידים!' : 'המבחן נשמר כטיוטה' });
      onDone();
    } catch (e) {
      console.error(e);
      toast({ title: 'שגיאה בשמירת המבחן', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onDone} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />חזרה
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">יצירת מבחן חדש</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {/* Quiz meta */}
        <div className="bg-card border border-border rounded-xl p-5 mb-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">כותרת המבחן *</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="לדוגמה: מבחן פרק 1 – ניתוח טכני"
              className="w-full h-11 px-4 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">שייך לשיעור (אופציונלי)</label>
              <select
                value={lessonId}
                onChange={e => setLessonId(e.target.value)}
                className="w-full h-11 px-4 bg-background ring-1 ring-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-right"
              >
                <option value="">ללא שיעור</option>
                {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">תיאור (אופציונלי)</label>
              <input
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="הוראות לנבחן..."
                className="w-full h-11 px-4 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
              />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4 mb-5">
          {questions.map((q, qIdx) => (
            <div key={q.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Question header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold text-foreground">שאלה {qIdx + 1}</span>
                <div className="flex gap-1 mr-auto">
                  <button
                    onClick={() => updateQuestion(q.id, { type: 'multiple_choice', options: q.type === 'multiple_choice' ? q.options : [
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                    ]})}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      q.type === 'multiple_choice' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <List className="w-3 h-3" />אמריקאית
                  </button>
                  <button
                    onClick={() => updateQuestion(q.id, { type: 'free_text', options: [] })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      q.type === 'free_text' ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <AlignLeft className="w-3 h-3" />חופשית
                  </button>
                </div>
                {questions.length > 1 && (
                  <button onClick={() => removeQuestion(q.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Question text */}
                <textarea
                  value={q.text}
                  onChange={e => updateQuestion(q.id, { text: e.target.value })}
                  placeholder={q.type === 'free_text' ? 'כתוב את השאלה הפתוחה כאן...' : 'כתוב את השאלה כאן...'}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                />

                {/* Multiple choice options */}
                {q.type === 'multiple_choice' && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">אפשרויות תשובה (סמן את הנכונה):</p>
                    {q.options.map((opt, oIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <button
                          onClick={() => setCorrect(q.id, opt.id)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            opt.isCorrect ? 'border-accent bg-accent' : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {opt.isCorrect && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
                        </button>
                        <span className="text-xs text-muted-foreground font-medium w-5 shrink-0 text-center">
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        <input
                          value={opt.text}
                          onChange={e => updateOption(q.id, opt.id, { text: e.target.value })}
                          placeholder={`אפשרות ${String.fromCharCode(65 + oIdx)}...`}
                          className="flex-1 h-9 px-3 bg-background ring-1 ring-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
                        />
                        {q.options.length > 2 && (
                          <button onClick={() => removeOption(q.id, opt.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {q.options.length < 6 && (
                      <button
                        onClick={() => addOption(q.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                      >
                        <Plus className="w-3 h-3" />הוסף אפשרות
                      </button>
                    )}
                  </div>
                )}

                {/* Free text note */}
                {q.type === 'free_text' && (
                  <div className="flex items-center gap-2 p-2.5 bg-accent/5 border border-accent/20 rounded-lg">
                    <AlignLeft className="w-3.5 h-3.5 text-accent shrink-0" />
                    <p className="text-xs text-muted-foreground">שאלה פתוחה — התלמיד יוכל לכתוב תשובה חופשית. לשאלה זו לא ינתן ציון אוטומטי.</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add question buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => addQuestion('multiple_choice')}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
          >
            <List className="w-4 h-4 text-primary" />הוסף שאלה אמריקאית
          </button>
          <button
            onClick={() => addQuestion('free_text')}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
          >
            <AlignLeft className="w-4 h-4 text-accent" />הוסף שאלה פתוחה
          </button>
        </div>

        {/* Save buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving || !title.trim()}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? <><div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />שומר...</> : 'שמור כטיוטה'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving || !title.trim()}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />מפרסם...</> : <><Send className="w-4 h-4" />פרסם לתלמידים</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SUBMISSIONS VIEW
// ═══════════════════════════════════════════════════════
function SubmissionDetail({ submission, onBack }: { submission: Submission & { answers?: { question_text: string; answer_text: string | null; selected_option_text?: string; is_correct: boolean | null }[] }; onBack: () => void }) {
  const fmt = (iso: string) => format(parseISO(iso), "d בMMM yyyy, HH:mm", { locale: he });
  return (
    <div className="h-full flex flex-col p-8" dir="rtl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5 self-start">
        <ChevronRight className="w-4 h-4" />חזרה לתוצאות
      </button>
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{fmt(submission.submitted_at)}</span>
          <h2 className="text-lg font-bold text-foreground">{submission.studentName}</h2>
        </div>
        <p className="text-sm text-muted-foreground text-right">{submission.quizTitle}</p>
        {submission.score != null && (
          <div className="mt-3 flex items-center gap-2 justify-end">
            <span className="text-2xl font-bold text-primary">{submission.score}/{submission.max_score}</span>
            <span className="text-sm text-muted-foreground">נקודות</span>
          </div>
        )}
      </div>
      <div className="space-y-3 overflow-y-auto flex-1">
        {(submission.answers ?? []).map((a, idx) => (
          <div key={idx} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              {a.is_correct != null && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  a.is_correct ? 'bg-accent/10 text-accent' : 'bg-destructive/10 text-destructive'
                }`}>
                  {a.is_correct ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                  {a.is_correct ? 'נכון' : 'שגוי'}
                </span>
              )}
              <p className="text-sm font-medium text-foreground text-right">{idx + 1}. {a.question_text}</p>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-sm text-foreground text-right">{a.selected_option_text || a.answer_text || <span className="text-muted-foreground italic">לא ענה</span>}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN HUB
// ═══════════════════════════════════════════════════════
export default function MentorQuizzesHub({ mentorId, initialLessonId, onBack }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<'list' | 'create' | 'submissions' | 'submission-detail'>('list');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [filterLessonId, setFilterLessonId] = useState<string>('');
  const [filterStudentId, setFilterStudentId] = useState<string>('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [submissionAnswers, setSubmissionAnswers] = useState<{ question_text: string; answer_text: string | null; selected_option_text?: string; is_correct: boolean | null }[]>([]);

  const fmt = (iso: string) => format(parseISO(iso), "d בMMM yyyy", { locale: he });

  // ── Queries ──
  const { data: categories = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['categories-for-quiz', mentorId],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, title').eq('mentor_id', mentorId).order('position');
      return data ?? [];
    },
  });

  const { data: lessons = [] } = useQuery<{ id: string; title: string; category_id: string | null }[]>({
    queryKey: ['lessons-for-quiz', mentorId],
    queryFn: async () => {
      const { data } = await supabase.from('lessons').select('id, title, category_id').eq('mentor_id', mentorId).order('position');
      return data ?? [];
    },
  });

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ['mentor-quizzes', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('quizzes').select('*').eq('mentor_id', mentorId).order('created_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all((data ?? []).map(async (quiz) => {
        const [lessonRes, qCountRes, subCountRes] = await Promise.all([
          quiz.lesson_id ? supabase.from('lessons').select('title').eq('id', quiz.lesson_id).single() : Promise.resolve({ data: null }),
          supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('quiz_id', quiz.id),
          supabase.from('quiz_submissions').select('id', { count: 'exact', head: true }).eq('quiz_id', quiz.id),
        ]);
        return {
          ...quiz,
          lessonTitle: (lessonRes.data as { title?: string } | null)?.title,
          questionCount: (qCountRes as { count: number | null }).count ?? 0,
          submissionCount: (subCountRes as { count: number | null }).count ?? 0,
        };
      }));
      return enriched;
    },
  });

  const { data: submissions = [] } = useQuery<Submission[]>({
    queryKey: ['mentor-quiz-submissions', mentorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('quiz_submissions').select('*').eq('mentor_id', mentorId).order('submitted_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all((data ?? []).map(async (s) => {
        const [profileRes, quizRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('user_id', s.student_id).single(),
          supabase.from('quizzes').select('title').eq('id', s.quiz_id).single(),
        ]);
        return {
          ...s,
          studentName: (profileRes.data as { full_name?: string } | null)?.full_name ?? 'תלמיד',
          quizTitle: (quizRes.data as { title?: string } | null)?.title ?? 'מבחן',
        };
      }));
      return enriched;
    },
    enabled: view === 'submissions' || view === 'submission-detail',
  });

  const { data: members = [] } = useQuery<{ student_id: string; full_name: string }[]>({
    queryKey: ['mentor-members-for-quiz', mentorId],
    queryFn: async () => {
      const { data } = await supabase.from('community_members').select('student_id').eq('mentor_id', mentorId);
      const enriched = await Promise.all((data ?? []).map(async (m) => {
        const { data: p } = await supabase.from('profiles').select('full_name').eq('user_id', m.student_id).single();
        return { student_id: m.student_id, full_name: (p as { full_name?: string } | null)?.full_name ?? 'תלמיד' };
      }));
      return enriched;
    },
  });

  // ── Mutations ──
  const togglePublish = useMutation({
    mutationFn: async ({ id, is_published }: { id: string; is_published: boolean }) => {
      const { error } = await supabase.from('quizzes').update({ is_published: !is_published }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-quizzes', mentorId] });
      toast({ title: 'סטטוס המבחן עודכן' });
    },
  });

  const deleteQuiz = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-quizzes', mentorId] });
      toast({ title: 'המבחן נמחק' });
    },
  });

  // Load submission detail
  const loadSubmissionDetail = async (sub: Submission) => {
    setSelectedSubmission(sub);
    // Fetch answers with question texts and option texts
    const { data: answers } = await supabase
      .from('quiz_answers')
      .select('question_id, answer_text, selected_option_id, is_correct')
      .eq('submission_id', sub.id);

    const enriched = await Promise.all((answers ?? []).map(async (a) => {
      const { data: qq } = await supabase.from('quiz_questions').select('question_text').eq('id', a.question_id).single();
      let selected_option_text: string | undefined;
      if (a.selected_option_id) {
        const { data: opt } = await supabase.from('quiz_question_options').select('option_text').eq('id', a.selected_option_id).single();
        selected_option_text = (opt as { option_text?: string } | null)?.option_text;
      }
      return {
        question_text: (qq as { question_text?: string } | null)?.question_text ?? '',
        answer_text: a.answer_text,
        selected_option_text,
        is_correct: a.is_correct,
      };
    }));
    setSubmissionAnswers(enriched);
    setView('submission-detail');
  };

  // ── Filtered submissions ──
  const filteredSubmissions = submissions.filter(s => {
    if (filterStudentId && s.student_id !== filterStudentId) return false;
    if (filterLessonId) {
      const quiz = quizzes.find(q => q.id === s.quiz_id);
      if (!quiz || quiz.lesson_id !== filterLessonId) return false;
    }
    return true;
  });

  // ── Views ──
  if (view === 'create') {
    return (
      <QuizBuilder
        mentorId={mentorId}
        lessons={lessons}
        initialLessonId={initialLessonId}
        onDone={() => setView('list')}
      />
    );
  }

  if (view === 'submission-detail' && selectedSubmission) {
    return (
      <SubmissionDetail
        submission={{ ...selectedSubmission, answers: submissionAnswers }}
        onBack={() => setView('submissions')}
      />
    );
  }

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-8 pt-8 pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-5">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />חזרה
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">מבחנים</h1>
              <p className="text-sm text-muted-foreground">{quizzes.length} מבחנים</p>
            </div>
          </div>
          <div className="mr-auto flex gap-2">
            <button
              onClick={() => setView(view === 'submissions' ? 'list' : 'submissions')}
              className={`flex items-center gap-2 h-9 px-4 rounded-lg border text-sm font-medium transition-all ${
                view === 'submissions' ? 'bg-accent/10 border-accent/30 text-accent' : 'border-border text-foreground hover:bg-muted'
              }`}
            >
              <Users className="w-4 h-4" />
              תוצאות תלמידים
              {submissions.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{submissions.length}</span>
              )}
            </button>
            <button
              onClick={() => setView('create')}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />צור מבחן חדש
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <AnimatePresence mode="wait">
          {/* ── Quizzes List ── */}
          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Filter bar */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">סנן:</span>
                </div>
                <select
                  value={filterLessonId}
                  onChange={e => setFilterLessonId(e.target.value)}
                  className="h-8 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">כל השיעורים</option>
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>

              {isLoading ? (
                <div className="text-center py-20 text-muted-foreground">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm">טוען מבחנים...</p>
                </div>
              ) : quizzes.filter(q => !filterLessonId || q.lesson_id === filterLessonId).length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">אין מבחנים עדיין</p>
                  <p className="text-sm mt-1">לחץ על "צור מבחן חדש" כדי להתחיל</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quizzes.filter(q => !filterLessonId || q.lesson_id === filterLessonId).map(quiz => (
                    <div key={quiz.id} className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-all">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          quiz.is_published ? 'bg-accent/10' : 'bg-muted'
                        }`}>
                          <ClipboardList className={`w-5 h-5 ${quiz.is_published ? 'text-accent' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              quiz.is_published ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'
                            }`}>
                              {quiz.is_published ? 'פורסם' : 'טיוטה'}
                            </span>
                            {quiz.lessonTitle && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground">
                                <BookOpen className="w-2.5 h-2.5" />{quiz.lessonTitle}
                              </span>
                            )}
                            <h3 className="text-sm font-semibold text-foreground">{quiz.title}</h3>
                          </div>
                          {quiz.description && <p className="text-xs text-muted-foreground mt-1 text-right">{quiz.description}</p>}
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground justify-end">
                            <span>{fmt(quiz.created_at)}</span>
                            <span>{quiz.questionCount} שאלות</span>
                            <span className="flex items-center gap-0.5">
                              <Users className="w-2.5 h-2.5" />{quiz.submissionCount} הגשות
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => togglePublish.mutate({ id: quiz.id, is_published: quiz.is_published })}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                            title={quiz.is_published ? 'הסתר מתלמידים' : 'פרסם לתלמידים'}
                          >
                            {quiz.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteQuiz.mutate(quiz.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Submissions View ── */}
          {view === 'submissions' && (
            <motion.div key="submissions" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {/* Filters */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">סנן:</span>
                </div>
                <select
                  value={filterLessonId}
                  onChange={e => setFilterLessonId(e.target.value)}
                  className="h-8 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">כל השיעורים</option>
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
                <select
                  value={filterStudentId}
                  onChange={e => setFilterStudentId(e.target.value)}
                  className="h-8 px-3 bg-background ring-1 ring-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">כל התלמידים</option>
                  {members.map(m => <option key={m.student_id} value={m.student_id}>{m.full_name}</option>)}
                </select>
              </div>

              {filteredSubmissions.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">אין הגשות עדיין</p>
                  <p className="text-sm mt-1">כשתלמידים יגישו מבחנים — התוצאות יופיעו כאן</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSubmissions.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => loadSubmissionDetail(sub)}
                      className="w-full bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-all text-right"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {sub.studentName?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 justify-end">
                            {sub.score != null && (
                              <span className="text-xs font-bold text-primary">{sub.score}/{sub.max_score}</span>
                            )}
                            <span className="text-sm font-semibold text-foreground">{sub.studentName}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{sub.quizTitle}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fmt(sub.submitted_at)}</p>
                        </div>
                        <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
