import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircleQuestion, Lock, BookOpen, Clock, Check, ChevronDown, Reply, ArrowLeft,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  studentId: string;
  mentorId: string;
  onGoToLesson?: (lessonId: string) => void;
}

interface MyQuestion {
  id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  lesson_id: string | null;
  lessonTitle?: string;
}

export default function StudentMyQuestions({ studentId, mentorId, onGoToLesson }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: questions = [] } = useQuery<MyQuestion[]>({
    queryKey: ['student-my-questions', studentId, mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('private_questions')
        .select('*')
        .eq('student_id', studentId)
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all(
        (data ?? []).map(async (q) => {
          if (!q.lesson_id) return { ...q, lessonTitle: undefined };
          const { data: lp } = await supabase.from('lessons').select('title').eq('id', q.lesson_id).single();
          return { ...q, lessonTitle: lp?.title ?? undefined };
        })
      );
      return enriched as MyQuestion[];
    },
  });

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`student-my-qs-${studentId}-${mentorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_questions', filter: `student_id=eq.${studentId}` }, () => {
        qc.invalidateQueries({ queryKey: ['student-my-questions', studentId, mentorId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [studentId, mentorId, qc]);

  const fmt = (iso: string) => format(parseISO(iso), "d בMMM, HH:mm", { locale: he });
  const unanswered = questions.filter(q => !q.answer).length;
  const answered = questions.filter(q => q.answer).length;

  return (
    <div className="h-full flex flex-col p-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <MessageCircleQuestion className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">השאלות שלי</h1>
          <p className="text-sm text-muted-foreground">
            {questions.length} שאלות פרטיות ·{' '}
            <span className={answered > 0 ? 'text-accent' : 'text-muted-foreground'}>
              {answered} נענו
            </span>
            {unanswered > 0 && (
              <span className="mr-2 text-primary font-medium animate-pulse">· {unanswered} ממתינות לתשובה</span>
            )}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {questions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">עדיין לא שאלת שאלות פרטיות</p>
            <p className="text-sm mt-1">בכל שיעור תוכל לשלוח שאלה פרטית למנטור</p>
          </div>
        ) : questions.map(q => {
          const isOpen = expanded === q.id;
          const hasAnswer = !!q.answer;
          return (
            <div
              key={q.id}
              className={`bg-card rounded-xl border overflow-hidden transition-all ${
                isOpen ? 'border-primary/30 shadow-sm' : 'border-border'
              } ${!hasAnswer ? 'ring-1 ring-primary/15' : ''}`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : q.id)}
                className="w-full flex items-start gap-3 p-4 text-right"
              >
                {/* Status indicator */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  hasAnswer ? 'bg-accent/10' : 'bg-primary/10'
                }`}>
                  {hasAnswer
                    ? <Check className="w-4 h-4 text-accent" />
                    : <Lock className="w-4 h-4 text-primary" />
                  }
                </div>

                <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {q.lessonTitle && (
                      <button
                        onClick={e => { e.stopPropagation(); if (q.lesson_id && onGoToLesson) onGoToLesson(q.lesson_id); }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all ${onGoToLesson && q.lesson_id ? 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer' : 'bg-muted text-muted-foreground'}`}
                        title={onGoToLesson && q.lesson_id ? 'עבור לשיעור' : undefined}
                      >
                        <BookOpen className="w-2.5 h-2.5" />{q.lessonTitle}
                        {onGoToLesson && q.lesson_id && <ArrowLeft className="w-2.5 h-2.5" />}
                      </button>
                    )}
                    {hasAnswer ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded-full text-[10px] font-medium">
                        <Check className="w-2.5 h-2.5" />נענה
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-medium">
                        <Clock className="w-2.5 h-2.5 animate-pulse" />ממתין לתשובה
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground mt-1 leading-relaxed line-clamp-2">{q.question}</p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
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
                        <p className="text-xs font-medium text-muted-foreground mb-1">שאלתך:</p>
                        <p className="text-sm text-foreground leading-relaxed">{q.question}</p>
                      </div>

                      {/* Answer */}
                      {hasAnswer ? (
                        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center shrink-0">
                              <Reply className="w-2.5 h-2.5 text-accent-foreground" />
                            </div>
                            <span className="text-xs font-semibold text-accent">תשובת המנטור</span>
                            {q.answered_at && (
                              <span className="text-[10px] text-muted-foreground">{fmt(q.answered_at)}</span>
                            )}
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">{q.answer}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground animate-pulse shrink-0" />
                          <p className="text-xs text-muted-foreground">המנטור טרם ענה לשאלה זו. תקבל עדכון ברגע שיתשובה.</p>
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
    </div>
  );
}
