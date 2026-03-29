import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  ClipboardList, ChevronRight, Check, AlignLeft, List,
  Send, TrendingUp, CheckCircle2, X, Eye, Lightbulb,
} from 'lucide-react';

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'free_text';
  position: number;
  expected_answer?: string | null;
  hint?: string | null;
}

interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  position: number;
  explanation: string | null;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  mentor_id: string;
  lesson_id: string | null;
}

interface ReviewAnswer {
  question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  is_correct: boolean | null;
}

type Answers = Record<string, { type: 'multiple_choice'; optionId: string } | { type: 'free_text'; text: string }>;

export default function StudentQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reviewFromUrl = searchParams.get('review') === 'true';
  const { user } = useAuth();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<{ got: number; max: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReview, setShowReview] = useState(reviewFromUrl);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { selected: string; isCorrect: boolean }>>({});
  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});

  const { data: quiz, isLoading: quizLoading } = useQuery<Quiz | null>({
    queryKey: ['student-quiz', quizId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quizzes')
        .select('id, title, description, is_published, mentor_id, lesson_id')
        .eq('id', quizId!)
        .single();
      return data ?? null;
    },
    enabled: !!quizId,
  });

  const { data: questions = [], isLoading: questionsLoading } = useQuery<QuizQuestion[]>({
    queryKey: ['student-quiz-questions', quizId],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_questions')
        .select('id, question_text, question_type, position, expected_answer, hint')
        .eq('quiz_id', quizId!)
        .order('position');
      return (data ?? []) as QuizQuestion[];
    },
    enabled: !!quizId,
  });

  const { data: options = [] } = useQuery<QuizOption[]>({
    queryKey: ['student-quiz-options', quizId],
    queryFn: async () => {
      if (questions.length === 0) return [];
      const { data } = await supabase
        .from('quiz_question_options')
        .select('id, question_id, option_text, is_correct, position, explanation')
        .in('question_id', questions.map(q => q.id))
        .order('position');
      return (data ?? []) as QuizOption[];
    },
    enabled: questions.length > 0,
  });

  // Check if already submitted
  const { data: existingSubmission } = useQuery({
    queryKey: ['student-quiz-submission', quizId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_submissions')
        .select('id, score, max_score')
        .eq('quiz_id', quizId!)
        .eq('student_id', user!.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!quizId && !!user,
  });

  // Fetch review answers when user clicks "view answers"
  const { data: reviewAnswers = [] } = useQuery<ReviewAnswer[]>({
    queryKey: ['student-quiz-review-answers', existingSubmission?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quiz_answers')
        .select('question_id, selected_option_id, answer_text, is_correct')
        .eq('submission_id', existingSubmission!.id);
      return (data ?? []) as ReviewAnswer[];
    },
    enabled: !!existingSubmission?.id && (showReview || reviewFromUrl),
  });

  const isLoading = quizLoading || questionsLoading;
  const mcQuestions = questions.filter(q => q.question_type === 'multiple_choice');
  const answeredCount = Object.keys(answers).length;
  const allAnswered = questions.every(q => {
    const a = answers[q.id];
    if (!a) return false;
    if (a.type === 'free_text') return a.text.trim().length > 0;
    if (a.type === 'multiple_choice') return !!a.optionId;
    return false;
  });

  const toPercent = (got: number, max: number) =>
    max > 0 ? Math.round((got / max) * 100) : null;

  // Normalize old submissions: if max_score != 100, convert to percentage
  const normalizeScore = (score: number | null, maxScore: number | null): number | null => {
    if (score == null || maxScore == null || maxScore === 0) return null;
    if (maxScore === 100) return score; // already a percentage (new format)
    return Math.round((score / maxScore) * 100); // old format: convert
  };

  const handleSubmit = async () => {
    if (!user || !quiz) return;
    setIsSubmitting(true);
    try {
      // Calculate score (multiple choice only)
      let got = 0;
      const max = mcQuestions.length;
      for (const q of mcQuestions) {
        const a = answers[q.id];
        if (a?.type === 'multiple_choice') {
          const opt = options.find(o => o.id === a.optionId);
          if (opt?.is_correct) got++;
        }
      }

      const pct = toPercent(got, max);

      // Insert submission — store percentage in score, 100 in max_score
      const { data: sub, error: subErr } = await supabase
        .from('quiz_submissions')
        .insert({
          quiz_id: quiz.id,
          student_id: user.id,
          mentor_id: quiz.mentor_id,
          score: pct,
          max_score: max > 0 ? 100 : null,
        })
        .select('id')
        .single();
      if (subErr) throw subErr;

      // Insert answers
      const answerRows = questions.map(q => {
        const a = answers[q.id];
        return {
          submission_id: sub.id,
          question_id: q.id,
          selected_option_id: a?.type === 'multiple_choice' ? a.optionId : null,
          answer_text: a?.type === 'free_text' ? a.text : null,
          is_correct: (() => {
            if (a?.type !== 'multiple_choice') return null;
            const opt = options.find(o => o.id === a.optionId);
            return opt?.is_correct ?? null;
          })(),
        };
      });
      const { error: ansErr } = await supabase.from('quiz_answers').insert(answerRows);
      if (ansErr) throw ansErr;

      setScore({ got, max });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      toast({ title: 'שגיאה בהגשת המבחן', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-secondary-foreground flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quiz || !quiz.is_published) {
    return (
      <div className="min-h-screen bg-background text-secondary-foreground flex flex-col items-center justify-center gap-4" dir="rtl">
        <ClipboardList className="w-12 h-12 text-secondary-foreground/30" />
        <p className="text-lg font-semibold text-secondary-foreground">המבחן אינו זמין</p>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity">
          <ChevronRight className="w-4 h-4" />חזרה
        </button>
      </div>
    );
  }

  // ── REVIEW SCREEN (already submitted + clicked "view answers") ──
  if (existingSubmission && showReview) {
    return (
      <div className="min-h-screen bg-background text-secondary-foreground" dir="rtl">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-sidebar-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-secondary-foreground/60 hover:text-secondary-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />חזרה
            </button>
            <span className="text-sm font-semibold text-secondary-foreground flex-1 text-center">סקירת תשובות</span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {questions.map((q, idx) => {
            const qOptions = options.filter(o => o.question_id === q.id);
            const rv = reviewAnswers.find(a => a.question_id === q.id);
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="bg-secondary/50 border border-sidebar-border rounded-xl overflow-hidden"
              >
                {/* Question header */}
                <div className={`flex items-center gap-3 px-5 py-3 border-b border-sidebar-border ${
                  q.question_type === 'free_text' ? 'bg-muted/20' :
                  rv?.is_correct ? 'bg-accent/10' : 'bg-destructive/10'
                }`}>
                  <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    q.question_type === 'free_text' ? 'bg-muted text-muted-foreground' :
                    rv?.is_correct ? 'bg-accent text-accent-foreground' : 'bg-destructive text-destructive-foreground'
                  }`}>
                    {q.question_type === 'free_text' ? idx + 1 :
                     rv?.is_correct ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  </span>
                  <p className="text-sm font-semibold text-secondary-foreground flex-1 text-right">{q.question_text}</p>
                  {q.question_type !== 'free_text' && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      rv?.is_correct ? 'bg-accent/20 text-accent' : 'bg-destructive/20 text-destructive'
                    }`}>
                      {rv?.is_correct ? 'נכון' : 'שגוי'}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  {q.question_type === 'multiple_choice' ? (
                    <div className="space-y-2">
                      {qOptions.map((opt, oIdx) => {
                        const isStudentAnswer = rv?.selected_option_id === opt.id;
                        const isCorrectAnswer = opt.is_correct;
                        let style = 'border-sidebar-border bg-secondary/30 text-secondary-foreground/60';
                        if (isCorrectAnswer) style = 'border-green-500 bg-green-500/10 text-secondary-foreground';
                        if (isStudentAnswer && !isCorrectAnswer) style = 'border-red-500 bg-red-500/10 text-secondary-foreground';
                        return (
                          <div key={opt.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${style}`}>
                            <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                              isCorrectAnswer ? 'border-green-500 bg-green-500 text-white' :
                              isStudentAnswer ? 'border-red-500 bg-red-500 text-white' :
                              'border-sidebar-border text-secondary-foreground/50'
                            }`}>
                              {isCorrectAnswer ? <Check className="w-3.5 h-3.5" /> :
                               isStudentAnswer ? <X className="w-3.5 h-3.5" /> :
                               String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="text-sm flex-1">{opt.option_text}</span>
                            {isCorrectAnswer && (
                              <span className="text-xs font-medium text-green-400">תשובה נכונה</span>
                            )}
                            {isStudentAnswer && !isCorrectAnswer && (
                              <span className="text-xs font-medium text-red-400">הבחירה שלך</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 bg-secondary/30 rounded-xl border border-sidebar-border">
                        <p className="text-xs text-secondary-foreground/60 mb-1 font-medium">התשובה שלך:</p>
                        <p className="text-sm text-secondary-foreground">{rv?.answer_text || '—'}</p>
                      </div>
                      {q.expected_answer && (
                        <div className="p-3 bg-primary/5 rounded-xl border border-primary/30">
                          <p className="text-xs font-medium text-primary mb-1">התשובה שהמנטור חיפש:</p>
                          <p className="text-sm text-secondary-foreground">{q.expected_answer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          <button
            onClick={() => navigate(-1)}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all mt-2"
          >
            חזרה לשיעור
          </button>
        </div>
      </div>
    );
  }

  // ── ALREADY SUBMITTED SCREEN ──
  if (existingSubmission && !submitted) {
    const pct = normalizeScore(existingSubmission.score, existingSubmission.max_score);
    return (
      <div className="min-h-screen bg-background text-secondary-foreground" dir="rtl">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-secondary-foreground/60 hover:text-secondary-foreground transition-colors mb-6">
            <ChevronRight className="w-4 h-4" />חזרה לשיעור
          </button>
          <div className="bg-secondary/50 border border-sidebar-border rounded-2xl p-8 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              pct == null ? 'bg-primary/10' : pct >= 70 ? 'bg-green-500/10' : 'bg-red-500/10'
            }`}>
              {pct == null || pct >= 70
                ? <CheckCircle2 className={`w-8 h-8 ${pct == null ? 'text-primary' : 'text-green-400'}`} />
                : <X className="w-8 h-8 text-red-400" />}
            </div>
            <h2 className="text-xl font-bold text-secondary-foreground mb-2">כבר הגשת מבחן זה</h2>
            {pct != null ? (
              <>
                <p className={`text-5xl font-bold mt-3 ${pct >= 70 ? 'text-green-400' : 'text-red-400'}`}>
                  {pct}
                </p>
                <p className="text-sm text-secondary-foreground/60 mt-1">נקודות מתוך 100</p>
              </>
            ) : (
              <p className="text-sm text-secondary-foreground/60 mt-2">המבחן הוגש — ציון טרם נקבע</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => navigate(-1)}
                className="flex-1 h-10 rounded-xl border border-sidebar-border text-sm font-medium text-secondary-foreground hover:bg-secondary/50 transition-all"
              >
                חזרה לשיעור
              </button>
              <button
                onClick={() => setShowReview(true)}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />צפה בתשובות
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT SCREEN (just submitted) ──
  if (submitted && score) {
    const pct = toPercent(score.got, score.max);
    return (
      <div className="min-h-screen bg-background text-secondary-foreground flex flex-col items-center justify-center px-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-secondary/50 border border-sidebar-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg"
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
            pct == null ? 'bg-primary/10' : pct >= 70 ? 'bg-green-500/10' : 'bg-red-500/10'
          }`}>
            {pct == null ? (
              <CheckCircle2 className="w-10 h-10 text-primary" />
            ) : pct >= 70 ? (
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            ) : (
              <X className="w-10 h-10 text-red-400" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-secondary-foreground mb-1">המבחן הוגש!</h2>
          {pct != null ? (
            <>
              <p className={`text-5xl font-bold mt-3 ${pct >= 70 ? 'text-green-400' : 'text-red-400'}`}>
                {pct}
              </p>
              <p className="text-sm text-secondary-foreground/60 mt-1">נקודות מתוך 100</p>
            </>
          ) : (
            <p className="text-sm text-secondary-foreground/60 mt-3">המבחן הוגש בהצלחה. השאלות הפתוחות נשלחו למנטור.</p>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 h-10 rounded-xl border border-sidebar-border text-sm font-medium text-secondary-foreground hover:bg-secondary/50 transition-all"
            >
              חזרה לשיעור
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              לוח הבית
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── QUIZ FORM — One question at a time ──
  const currentQuestion = questions[currentIndex];
  const currentOptions = currentQuestion ? options.filter(o => o.question_id === currentQuestion.id) : [];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const currentFeedback = currentQuestion ? feedbackMap[currentQuestion.id] : undefined;
  const isLastQuestion = currentIndex === questions.length - 1;
  const progressPct = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const handleSelectOption = (questionId: string, optionId: string) => {
    // If already answered this question, ignore
    if (feedbackMap[questionId]) return;
    const opt = options.find(o => o.id === optionId);
    const isCorrect = opt?.is_correct ?? false;
    setAnswers(prev => ({ ...prev, [questionId]: { type: 'multiple_choice', optionId } }));
    setFeedbackMap(prev => ({ ...prev, [questionId]: { selected: optionId, isCorrect } }));
  };

  const handleNext = () => {
    if (isLastQuestion) return;
    setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentIndex === 0) return;
    setCurrentIndex(prev => prev - 1);
  };

  const letterLabels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

  return (
    <div className="min-h-screen bg-background text-secondary-foreground" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-sidebar-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-secondary-foreground/70 hover:text-secondary-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />חזרה
          </button>
          <div className="flex-1 text-center">
            <span className="text-sm font-semibold text-secondary-foreground">{quiz.title}</span>
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

      {currentQuestion && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              {/* Question text */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-primary px-2 py-0.5 rounded-full bg-primary/10">
                    שאלה {currentIndex + 1}
                  </span>
                  <span className="text-xs text-secondary-foreground/50">
                    {currentQuestion.question_type === 'multiple_choice' ? 'אמריקאית' : 'פתוחה'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-secondary-foreground leading-relaxed">
                  {currentQuestion.question_text}
                </h2>
              </div>

              {/* Options / Free text */}
              {currentQuestion.question_type === 'multiple_choice' ? (
                <div className="space-y-3">
                  {currentOptions.map((opt, oIdx) => {
                    const isSelected = currentFeedback?.selected === opt.id;
                    const isCorrectOption = opt.is_correct;
                    const hasFeedback = !!currentFeedback;

                    let borderClass = 'border-sidebar-border';
                    let bgClass = 'bg-secondary/50';
                    let letterBg = 'bg-sidebar-accent text-secondary-foreground/70';
                    let badgeEl: React.ReactNode = null;

                    if (hasFeedback) {
                      if (isCorrectOption) {
                        // Always highlight the correct answer green
                        borderClass = 'border-green-500';
                        bgClass = 'bg-green-500/10';
                        letterBg = 'bg-green-500 text-white';
                        badgeEl = (
                          <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />התשובה הנכונה
                          </span>
                        );
                      } else if (isSelected && !isCorrectOption) {
                        // Wrong selection — red
                        borderClass = 'border-red-500';
                        bgClass = 'bg-red-500/10';
                        letterBg = 'bg-red-500 text-white';
                        badgeEl = (
                          <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                            <X className="w-3.5 h-3.5" />לא בדיוק
                          </span>
                        );
                      } else {
                        // Other options — muted
                        bgClass = 'bg-secondary/30';
                        borderClass = 'border-sidebar-border/50';
                      }
                    }

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectOption(currentQuestion.id, opt.id)}
                        disabled={hasFeedback}
                        className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-right transition-all ${borderClass} ${bgClass} ${
                          !hasFeedback ? 'hover:border-primary/50 hover:bg-secondary/70 cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold transition-all ${letterBg}`}>
                          {hasFeedback && isCorrectOption ? <Check className="w-4 h-4" /> :
                           hasFeedback && isSelected && !isCorrectOption ? <X className="w-4 h-4" /> :
                           letterLabels[oIdx] || String.fromCharCode(65 + oIdx)}
                        </span>
                        <span className={`text-sm flex-1 ${hasFeedback && !isCorrectOption && !isSelected ? 'text-secondary-foreground/40' : 'text-secondary-foreground'}`}>
                          {opt.option_text}
                        </span>
                        {badgeEl}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={currentAnswer?.type === 'free_text' ? currentAnswer.text : ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [currentQuestion.id]: { type: 'free_text', text: e.target.value } }))}
                  placeholder="כתוב את תשובתך כאן..."
                  rows={5}
                  className="w-full px-5 py-4 bg-secondary/50 ring-1 ring-sidebar-border rounded-xl text-sm text-secondary-foreground placeholder-secondary-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                />
              )}

              {/* Per-option explanations after feedback */}
              {currentFeedback && currentQuestion.question_type === 'multiple_choice' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-2"
                >
                  {currentOptions
                    .filter(o => o.explanation && (o.is_correct || o.id === currentFeedback.selected))
                    .map(o => (
                      <div key={o.id} className={`p-3 rounded-xl border ${
                        o.is_correct ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
                      }`}>
                        <p className={`text-xs font-medium mb-0.5 ${o.is_correct ? 'text-green-400' : 'text-red-400'}`}>
                          {o.option_text}
                        </p>
                        <p className="text-sm text-secondary-foreground/80">{o.explanation}</p>
                      </div>
                    ))}
                </motion.div>
              )}

              {/* Hint button */}
              {currentQuestion.hint && (
                <div className="mt-4">
                  {!revealedHints[currentQuestion.id] ? (
                    <button
                      onClick={() => setRevealedHints(prev => ({ ...prev, [currentQuestion.id]: true }))}
                      className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
                    >
                      <Lightbulb className="w-4 h-4" />
                      הצג רמז
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl bg-primary/5 border border-primary/20"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Lightbulb className="w-4 h-4 text-primary" />
                        <span className="text-xs font-medium text-primary">רמז</span>
                      </div>
                      <p className="text-sm text-secondary-foreground/80">{currentQuestion.hint}</p>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation buttons */}
          <div className="flex items-center gap-3 mt-10">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={`h-11 px-6 rounded-xl text-sm font-medium transition-all ${
                currentIndex === 0
                  ? 'text-secondary-foreground/30 cursor-not-allowed'
                  : 'text-secondary-foreground border border-sidebar-border hover:bg-secondary/50'
              }`}
            >
              הקודם
            </button>
            <div className="flex-1" />
            {isLastQuestion ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !allAnswered}
                className={`h-11 px-8 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                  allAnswered
                    ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-lg'
                    : 'bg-secondary text-secondary-foreground/40 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />מגיש...</>
                ) : (
                  <><Send className="w-4 h-4" />הגש מבחן</>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="h-11 px-8 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-lg"
              >
                הבא
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
