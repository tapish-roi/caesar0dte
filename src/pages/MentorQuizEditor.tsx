import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronRight, Check, X, Plus, List, AlignLeft,
  Send, ClipboardList, Lightbulb, Trash2,
} from 'lucide-react';

type QuestionType = 'multiple_choice' | 'free_text';

interface DraftOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

interface DraftQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options: DraftOption[];
  expectedAnswer: string;
  hint: string;
}

function genId() { return Math.random().toString(36).slice(2); }

const emptyQuestion = (): DraftQuestion => ({
  id: genId(),
  text: '',
  type: 'multiple_choice',
  options: [
    { id: genId(), text: '', isCorrect: false, explanation: '' },
    { id: genId(), text: '', isCorrect: false, explanation: '' },
    { id: genId(), text: '', isCorrect: false, explanation: '' },
    { id: genId(), text: '', isCorrect: false, explanation: '' },
  ],
  expectedAnswer: '',
  hint: '',
});

export default function MentorQuizEditor() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !quizId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [lessonId, setLessonId] = useState(searchParams.get('lessonId') ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showMeta, setShowMeta] = useState(isNew); // show meta form initially for new quizzes

  const mentorId = user?.id ?? '';

  // Fetch lessons & categories
  const { data: lessons = [] } = useQuery({
    queryKey: ['quiz-editor-lessons', mentorId],
    queryFn: async () => {
      const { data } = await supabase.from('lessons').select('id, title, category_id').eq('mentor_id', mentorId).order('position');
      return data ?? [];
    },
    staleTime: 0,
    enabled: !!mentorId,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['quiz-editor-categories', mentorId],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, title').eq('mentor_id', mentorId).order('position');
      return data ?? [];
    },
    staleTime: 0,
    enabled: !!mentorId,
  });

  // If editing, load existing quiz data
  const { data: existingQuiz } = useQuery({
    queryKey: ['quiz-editor-quiz', quizId],
    queryFn: async () => {
      const { data } = await supabase.from('quizzes').select('*').eq('id', quizId!).single();
      return data;
    },
    enabled: !!quizId,
  });

  const { data: existingQuestions = [] } = useQuery({
    queryKey: ['quiz-editor-questions', quizId],
    queryFn: async () => {
      const { data } = await supabase.from('quiz_questions')
        .select('id, question_text, question_type, position, expected_answer, hint')
        .eq('quiz_id', quizId!).order('position');
      return data ?? [];
    },
    enabled: !!quizId,
  });

  const { data: existingOptions = [] } = useQuery({
    queryKey: ['quiz-editor-options', quizId],
    queryFn: async () => {
      if (existingQuestions.length === 0) return [];
      const { data } = await supabase.from('quiz_question_options')
        .select('id, question_id, option_text, is_correct, position, explanation')
        .in('question_id', existingQuestions.map((q: any) => q.id)).order('position');
      return data ?? [];
    },
    enabled: existingQuestions.length > 0,
  });

  // Populate state when editing existing quiz
  useEffect(() => {
    if (existingQuiz && existingQuestions.length > 0) {
      setTitle(existingQuiz.title);
      setDescription(existingQuiz.description ?? '');
      setLessonId(existingQuiz.lesson_id ?? '');
      const currentLesson = existingQuiz.lesson_id ? lessons.find(l => l.id === existingQuiz.lesson_id) : null;
      setSelectedCategoryId(currentLesson?.category_id ?? '');
      setShowMeta(false);

      const drafts: DraftQuestion[] = existingQuestions.map((q: any) => ({
        id: q.id,
        text: q.question_text,
        type: q.question_type as QuestionType,
        expectedAnswer: q.expected_answer ?? '',
        hint: q.hint ?? '',
        options: existingOptions
          .filter((o: any) => o.question_id === q.id)
          .sort((a: any, b: any) => a.position - b.position)
          .map((o: any) => ({ id: o.id, text: o.option_text, isCorrect: o.is_correct, explanation: o.explanation ?? '' })),
      }));
      setQuestions(drafts.length > 0 ? drafts : [emptyQuestion()]);
    }
  }, [existingQuiz, existingQuestions, existingOptions, lessons]);

  const lessonsInCategory = selectedCategoryId
    ? lessons.filter(l => l.category_id === selectedCategoryId)
    : lessons;

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const letterLabels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

  // Question manipulation
  const updateQuestion = (qId: string, patch: Partial<DraftQuestion>) =>
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...patch } : q));

  const updateOption = (qId: string, optId: string, patch: Partial<DraftOption>) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q, options: q.options.map(o => o.id === optId ? { ...o, ...patch } : o),
    } : q));

  const setCorrect = (qId: string, optId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q, options: q.options.map(o => ({ ...o, isCorrect: o.id === optId })),
    } : q));

  const addOption = (qId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q, options: [...q.options, { id: genId(), text: '', isCorrect: false }],
    } : q));

  const removeOption = (qId: string, optId: string) =>
    setQuestions(prev => prev.map(q => q.id === qId ? {
      ...q, options: q.options.filter(o => o.id !== optId),
    } : q));

  const addQuestion = (type: QuestionType) => {
    const q = emptyQuestion();
    q.type = type;
    if (type === 'free_text') q.options = [];
    setQuestions(prev => [...prev, q]);
    setCurrentIndex(questions.length); // go to the new question
  };

  const removeCurrentQuestion = () => {
    if (questions.length <= 1) return;
    setQuestions(prev => prev.filter((_, i) => i !== currentIndex));
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) { toast({ title: 'נדרשת כותרת למבחן', variant: 'destructive' }); setShowMeta(true); return; }
    if (questions.some(q => !q.text.trim())) { toast({ title: 'כל השאלות חייבות להיות מלאות', variant: 'destructive' }); return; }
    if (questions.some(q => q.type === 'multiple_choice' && q.options.filter(o => o.text.trim()).length < 2)) {
      toast({ title: 'שאלות אמריקאיות חייבות להכיל לפחות 2 אפשרויות', variant: 'destructive' }); return;
    }

    setIsSaving(true);
    try {
      let targetQuizId = quizId;

      if (isNew) {
        const { data: quiz, error } = await supabase.from('quizzes').insert({
          mentor_id: mentorId,
          lesson_id: lessonId || null,
          title: title.trim(),
          description: description.trim() || null,
          is_published: publish,
        }).select('id').single();
        if (error) throw error;
        targetQuizId = quiz.id;
      } else {
        await supabase.from('quizzes').update({
          title: title.trim(),
          description: description.trim() || null,
          lesson_id: lessonId || null,
          is_published: publish ? true : undefined,
        }).eq('id', quizId!);

        // Delete old questions & options
        if (existingQuestions.length > 0) {
          await supabase.from('quiz_question_options').delete().in('question_id', existingQuestions.map((q: any) => q.id));
          await supabase.from('quiz_questions').delete().eq('quiz_id', quizId!);
        }
      }

      // Insert questions + options
      for (let i = 0; i < questions.length; i++) {
        const dq = questions[i];
        const { data: dbQ, error: qqErr } = await supabase.from('quiz_questions').insert({
          quiz_id: targetQuizId!,
          question_text: dq.text.trim(),
          question_type: dq.type,
          position: i,
          expected_answer: dq.type === 'free_text' && dq.expectedAnswer?.trim() ? dq.expectedAnswer.trim() : null,
          hint: dq.hint?.trim() || null,
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

      qc.invalidateQueries({ queryKey: ['mentor-quizzes'] });
      qc.invalidateQueries({ queryKey: ['quiz-detail-questions'] });
      toast({ title: publish ? 'המבחן פורסם לתלמידים!' : 'המבחן נשמר בהצלחה' });
      navigate(-1);
    } catch (e) {
      console.error(e);
      toast({ title: 'שגיאה בשמירת המבחן', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-secondary-foreground" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-sidebar-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-secondary-foreground/70 hover:text-secondary-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />חזרה
          </button>
          <div className="flex-1 text-center">
            <span className="text-sm font-semibold text-secondary-foreground">
              {isNew ? 'יצירת מבחן חדש' : 'עריכת מבחן'}
            </span>
          </div>
          <span className="text-xs font-medium text-secondary-foreground/60 tabular">
            {currentIndex + 1}/{questions.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pb-2">
          <div className="w-full h-1.5 bg-sidebar-accent rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Quiz meta (collapsible) */}
        <button
          onClick={() => setShowMeta(prev => !prev)}
          className="w-full flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-secondary/50 border border-sidebar-border text-sm text-secondary-foreground hover:bg-secondary/70 transition-all"
        >
          <ClipboardList className="w-4 h-4 text-primary" />
          <span className="font-medium">{title || 'הגדרות מבחן'}</span>
          <span className="mr-auto text-xs text-secondary-foreground/50">
            {showMeta ? 'סגור' : 'ערוך'}
          </span>
        </button>

        <AnimatePresence>
          {showMeta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-secondary/50 border border-sidebar-border rounded-xl p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary-foreground mb-1.5">כותרת המבחן *</label>
                  <input
                    value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="לדוגמה: מבחן פרק 1 – ניתוח טכני"
                    className="w-full h-11 px-4 bg-secondary/80 ring-1 ring-sidebar-border rounded-lg text-sm text-secondary-foreground placeholder-secondary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-foreground mb-1.5">קטגוריה</label>
                    <select
                      value={selectedCategoryId}
                      onChange={e => { setSelectedCategoryId(e.target.value); setLessonId(''); }}
                      className="w-full h-11 px-4 bg-secondary/80 ring-1 ring-sidebar-border rounded-lg text-sm text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary text-right"
                    >
                      <option value="">כל הקטגוריות</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary-foreground mb-1.5">שיעור</label>
                    <select
                      value={lessonId}
                      onChange={e => setLessonId(e.target.value)}
                      className="w-full h-11 px-4 bg-secondary/80 ring-1 ring-sidebar-border rounded-lg text-sm text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary text-right"
                    >
                      <option value="">ללא שיעור</option>
                      {lessonsInCategory.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary-foreground mb-1.5">תיאור</label>
                    <input
                      value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="הוראות לנבחן..."
                      className="w-full h-11 px-4 bg-secondary/80 ring-1 ring-sidebar-border rounded-lg text-sm text-secondary-foreground placeholder-secondary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-right"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current question editor */}
        {currentQuestion && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              {/* Question type toggle + delete */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium text-primary px-2 py-0.5 rounded-full bg-primary/10">
                  שאלה {currentIndex + 1}
                </span>
                <button
                  onClick={() => updateQuestion(currentQuestion.id, {
                    type: 'multiple_choice',
                    options: currentQuestion.type === 'multiple_choice' ? currentQuestion.options : [
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                      { id: genId(), text: '', isCorrect: false },
                    ]
                  })}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentQuestion.type === 'multiple_choice' ? 'bg-primary/10 text-primary' : 'text-secondary-foreground/50 hover:text-secondary-foreground'
                  }`}
                >
                  <List className="w-3 h-3" />אמריקאית
                </button>
                <button
                  onClick={() => updateQuestion(currentQuestion.id, { type: 'free_text', options: [] })}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentQuestion.type === 'free_text' ? 'bg-primary/10 text-primary' : 'text-secondary-foreground/50 hover:text-secondary-foreground'
                  }`}
                >
                  <AlignLeft className="w-3 h-3" />פתוחה
                </button>
                <div className="flex-1" />
                {questions.length > 1 && (
                  <button
                    onClick={removeCurrentQuestion}
                    className="flex items-center gap-1 text-xs text-secondary-foreground/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />מחק שאלה
                  </button>
                )}
              </div>

              {/* Question text */}
              <textarea
                value={currentQuestion.text}
                onChange={e => updateQuestion(currentQuestion.id, { text: e.target.value })}
                placeholder="כתוב את השאלה כאן..."
                rows={3}
                className="w-full px-5 py-4 bg-secondary/50 ring-1 ring-sidebar-border rounded-xl text-base text-secondary-foreground placeholder-secondary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right mb-5"
              />

              {/* Options for multiple choice */}
              {currentQuestion.type === 'multiple_choice' && (
                <div className="space-y-3 mb-5">
                  <p className="text-xs text-secondary-foreground/60 font-medium">אפשרויות תשובה (לחץ על העיגול לסימון נכונה):</p>
                  {currentQuestion.options.map((opt, oIdx) => {
                    return (
                      <div key={opt.id} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all ${
                        opt.isCorrect ? 'border-green-500 bg-green-500/10' : 'border-sidebar-border bg-secondary/50'
                      }`}>
                        <button
                          onClick={() => setCorrect(currentQuestion.id, opt.id)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold transition-all ${
                            opt.isCorrect ? 'bg-green-500 text-white' : 'bg-sidebar-accent text-secondary-foreground/70'
                          }`}
                        >
                          {opt.isCorrect ? <Check className="w-4 h-4" /> : letterLabels[oIdx] || String.fromCharCode(65 + oIdx)}
                        </button>
                        <input
                          value={opt.text}
                          onChange={e => updateOption(currentQuestion.id, opt.id, { text: e.target.value })}
                          placeholder={`אפשרות ${letterLabels[oIdx] || String.fromCharCode(65 + oIdx)}...`}
                          className="flex-1 bg-transparent text-sm text-secondary-foreground placeholder-secondary-foreground/30 focus:outline-none text-right"
                        />
                        {currentQuestion.options.length > 2 && (
                          <button onClick={() => removeOption(currentQuestion.id, opt.id)} className="text-secondary-foreground/30 hover:text-red-400 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {currentQuestion.options.length < 6 && (
                    <button
                      onClick={() => addOption(currentQuestion.id)}
                      className="flex items-center gap-1.5 text-xs text-secondary-foreground/50 hover:text-primary transition-colors"
                    >
                      <Plus className="w-3 h-3" />הוסף אפשרות
                    </button>
                  )}
                </div>
              )}

              {/* Free text expected answer */}
              {currentQuestion.type === 'free_text' && (
                <div className="mb-5 space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <AlignLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-xs text-secondary-foreground/70">שאלה פתוחה — התלמיד יכתוב תשובה חופשית. לא ינתן ציון אוטומטי.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-secondary-foreground/60 mb-1">תשובה רצויה (אופציונלי):</label>
                    <textarea
                      value={currentQuestion.expectedAnswer}
                      onChange={e => updateQuestion(currentQuestion.id, { expectedAnswer: e.target.value })}
                      placeholder="תשובה שתוצג לתלמיד בסיום..."
                      rows={2}
                      className="w-full px-4 py-3 bg-secondary/50 ring-1 ring-sidebar-border rounded-xl text-sm text-secondary-foreground placeholder-secondary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                    />
                  </div>
                </div>
              )}

              {/* Hint editor */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <label className="text-xs font-medium text-secondary-foreground/70">רמז לתלמיד (אופציונלי)</label>
                </div>
                <textarea
                  value={currentQuestion.hint}
                  onChange={e => updateQuestion(currentQuestion.id, { hint: e.target.value })}
                  placeholder="רמז שהתלמיד יוכל לפתוח בזמן המבחן..."
                  rows={2}
                  className="w-full px-4 py-3 bg-primary/5 ring-1 ring-primary/20 rounded-xl text-sm text-secondary-foreground placeholder-secondary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Navigation + add question */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className={`h-11 px-6 rounded-xl text-sm font-medium transition-all ${
              currentIndex === 0
                ? 'text-secondary-foreground/30 cursor-not-allowed'
                : 'text-secondary-foreground border border-sidebar-border hover:bg-secondary/50'
            }`}
          >
            הקודם
          </button>

          <div className="flex-1 flex items-center justify-center gap-2">
            <button
              onClick={() => addQuestion('multiple_choice')}
              className="flex items-center gap-1 text-xs text-secondary-foreground/50 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
            >
              <Plus className="w-3 h-3" />אמריקאית
            </button>
            <button
              onClick={() => addQuestion('free_text')}
              className="flex items-center gap-1 text-xs text-secondary-foreground/50 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
            >
              <Plus className="w-3 h-3" />פתוחה
            </button>
          </div>

          {isLastQuestion ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="h-11 px-5 rounded-xl border border-sidebar-border text-sm font-medium text-secondary-foreground hover:bg-secondary/50 transition-all disabled:opacity-50"
              >
                שמור טיוטה
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />שומר...</>
                ) : (
                  <><Send className="w-4 h-4" />פרסם</>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className="h-11 px-8 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-lg"
            >
              הבא
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
