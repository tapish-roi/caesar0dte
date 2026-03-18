import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  ClipboardList, ChevronRight, Check, AlignLeft, List,
  Send, TrendingUp, CheckCircle2, X, Eye,
} from 'lucide-react';

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'free_text';
  position: number;
}

interface QuizOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  position: number;
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<{ got: number; max: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReview, setShowReview] = useState(false);

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
        .select('id, question_text, question_type, position')
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
        .select('id, question_id, option_text, is_correct, position')
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
    enabled: !!existingSubmission?.id && showReview,
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
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!quiz || !quiz.is_published) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4" dir="rtl">
        <ClipboardList className="w-12 h-12 text-muted-foreground opacity-30" />
        <p className="text-lg font-semibold text-foreground">המבחן אינו זמין</p>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity">
          <ChevronRight className="w-4 h-4" />חזרה
        </button>
      </div>
    );
  }

  // ── REVIEW SCREEN (already submitted + clicked "view answers") ──
  if (existingSubmission && showReview) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => setShowReview(false)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />חזרה לתוצאה
            </button>
            <span className="text-sm font-semibold text-foreground flex-1 text-center">סקירת תשובות</span>
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
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Question header */}
                <div className={`flex items-center gap-3 px-5 py-3 border-b border-border ${
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
                  <p className="text-sm font-semibold text-foreground flex-1 text-right">{q.question_text}</p>
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
                        let style = 'border-border bg-muted/10 text-muted-foreground';
                        if (isCorrectAnswer) style = 'border-accent bg-accent/10 text-foreground';
                        if (isStudentAnswer && !isCorrectAnswer) style = 'border-destructive bg-destructive/10 text-foreground';
                        return (
                          <div key={opt.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${style}`}>
                            <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                              isCorrectAnswer ? 'border-accent bg-accent text-accent-foreground' :
                              isStudentAnswer ? 'border-destructive bg-destructive text-destructive-foreground' :
                              'border-border text-muted-foreground'
                            }`}>
                              {isCorrectAnswer ? <Check className="w-3.5 h-3.5" /> :
                               isStudentAnswer ? <X className="w-3.5 h-3.5" /> :
                               String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="text-sm flex-1">{opt.option_text}</span>
                            {isCorrectAnswer && (
                              <span className="text-xs font-medium text-accent">תשובה נכונה</span>
                            )}
                            {isStudentAnswer && !isCorrectAnswer && (
                              <span className="text-xs font-medium text-destructive">הבחירה שלך</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 bg-muted/30 rounded-xl border border-border">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">התשובה שלך:</p>
                      <p className="text-sm text-foreground">{rv?.answer_text || '—'}</p>
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
    const pct = existingSubmission.score;
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ChevronRight className="w-4 h-4" />חזרה לשיעור
          </button>
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              pct == null ? 'bg-accent/10' : pct >= 70 ? 'bg-accent/10' : 'bg-destructive/10'
            }`}>
              {pct == null || pct >= 70
                ? <CheckCircle2 className="w-8 h-8 text-accent" />
                : <X className="w-8 h-8 text-destructive" />}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">כבר הגשת מבחן זה</h2>
            {pct != null ? (
              <>
                <p className={`text-5xl font-bold mt-3 ${pct >= 70 ? 'text-accent' : 'text-destructive'}`}>
                  {pct}
                </p>
                <p className="text-sm text-muted-foreground mt-1">נקודות מתוך 100</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">המבחן הוגש — ציון טרם נקבע</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => navigate(-1)}
                className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center shadow-lg"
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 ${
            pct == null ? 'bg-accent/10' : pct >= 70 ? 'bg-accent/10' : 'bg-destructive/10'
          }`}>
            {pct == null ? (
              <CheckCircle2 className="w-10 h-10 text-accent" />
            ) : pct >= 70 ? (
              <CheckCircle2 className="w-10 h-10 text-accent" />
            ) : (
              <X className="w-10 h-10 text-destructive" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-1">המבחן הוגש!</h2>
          {pct != null ? (
            <>
              <p className={`text-5xl font-bold mt-3 ${pct >= 70 ? 'text-accent' : 'text-destructive'}`}>
                {pct}
              </p>
              <p className="text-sm text-muted-foreground mt-1">נקודות מתוך 100</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-3">המבחן הוגש בהצלחה. השאלות הפתוחות נשלחו למנטור.</p>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-all"
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

  // ── QUIZ FORM ──
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />חזרה
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">TradeLearn</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Quiz header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-6 mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">{quiz.title}</h1>
              {quiz.description && <p className="text-sm text-muted-foreground mt-1">{quiz.description}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{questions.length} שאלות</span>
                {mcQuestions.length > 0 && <span>{mcQuestions.length} שאלות אמריקאיות</span>}
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
              <span>{answeredCount}/{questions.length} נענו</span>
              <span>{Math.round((answeredCount / Math.max(questions.length, 1)) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(answeredCount / Math.max(questions.length, 1)) * 100}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Questions */}
        <div className="space-y-4 mb-6">
          <AnimatePresence>
            {questions.map((q, idx) => {
              const qOptions = options.filter(o => o.question_id === q.id);
              const answer = answers[q.id];
              return (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Question header */}
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-muted/20">
                    <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 transition-all ${
                      answer ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {answer ? <Check className="w-3 h-3" /> : idx + 1}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      q.question_type === 'multiple_choice' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                    }`}>
                      {q.question_type === 'multiple_choice' ? <><List className="w-2.5 h-2.5" />אמריקאית</> : <><AlignLeft className="w-2.5 h-2.5" />פתוחה</>}
                    </span>
                    <p className="text-sm font-semibold text-foreground flex-1 text-right">{q.question_text}</p>
                  </div>
                  <div className="p-5">
                    {q.question_type === 'multiple_choice' ? (
                      <div className="space-y-2">
                        {qOptions.map((opt, oIdx) => {
                          const isSelected = answer?.type === 'multiple_choice' && answer.optionId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: { type: 'multiple_choice', optionId: opt.id } }))}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-right transition-all ${
                                isSelected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
                              }`}
                            >
                              <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                              }`}>
                                {isSelected ? <Check className="w-3.5 h-3.5" /> : String.fromCharCode(65 + oIdx)}
                              </span>
                              <span className={`text-sm flex-1 ${isSelected ? 'font-medium text-foreground' : 'text-foreground'}`}>
                                {opt.option_text}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={answer?.type === 'free_text' ? answer.text : ''}
                        onChange={e => setAnswers(prev => ({ ...prev, [q.id]: { type: 'free_text', text: e.target.value } }))}
                        placeholder="כתוב את תשובתך כאן..."
                        rows={4}
                        className="w-full px-4 py-3 bg-background ring-1 ring-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none text-right"
                      />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Submit */}
        <div className="sticky bottom-4">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !allAnswered}
            className={`w-full h-12 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg ${
              allAnswered
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />מגיש...</>
            ) : (
              <><Send className="w-4 h-4" />הגש מבחן {!allAnswered && `(${answeredCount}/${questions.length} נענו)`}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
