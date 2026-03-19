import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, GraduationCap, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const mentorName = searchParams.get('mentor') ?? 'המנטור שלך';
  const mentorId = searchParams.get('mentor_id') ?? '';
  const prefillEmail = searchParams.get('email') ?? '';

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({ title: 'שגיאה', description: 'יש להזין כתובת מייל', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'שגיאה', description: 'הסיסמאות אינן תואמות', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'שגיאה', description: 'הסיסמה חייבת להכיל לפחות 6 תווים', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Check if there's already an active session (from invite token in hash)
      const { data: { session: existingSession } } = await supabase.auth.getSession();

      if (existingSession?.user) {
        // User is already signed in via the invite token — just update the password
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      } else {
        // Try signing in first (existing user who got a recovery link)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          // If sign-in fails, the token hasn't been processed yet — try OTP exchange from hash
          // and then update password, OR sign up as new user
          const hash = window.location.hash;
          if (hash && hash.includes('access_token')) {
            // Let Supabase process the hash token
            // onAuthStateChange will fire — wait for session
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('תם הזמן לאימות הטוקן')), 8000);
              const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                  clearTimeout(timeout);
                  subscription.unsubscribe();
                  const { error: updErr } = await supabase.auth.updateUser({ password });
                  if (updErr) reject(updErr);
                  else resolve();
                }
              });
            });
          } else {
            throw new Error('לא ניתן להתחבר עם פרטים אלה. אנא בדוק/י את כתובת המייל.');
          }
        }
      }

      // Join mentor's community if mentorId is provided
      if (mentorId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from('community_members').upsert(
            { student_id: session.user.id, mentor_id: mentorId },
            { onConflict: 'student_id,mentor_id' } as never
          );
        }
      }

      setDone(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה לא צפויה';
      toast({ title: 'שגיאה', description: message, variant: 'destructive' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden auth-bg" dir="rtl">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, hsl(160 84% 39%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, hsl(222 47% 40%) 0%, transparent 70%)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[480px]"
      >
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">TradeLearn</h1>
          <p className="text-sm text-muted-foreground">פלטפורמת מנטורינג למסחר מקצועי</p>
        </div>

        <div className="bg-card rounded-2xl card-shadow overflow-hidden">
          <div className="p-8">
            {done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7 text-accent" />
                </div>
                <h2 className="text-xl font-bold text-foreground">ברוך הבא!</h2>
                <p className="text-sm text-muted-foreground">החשבון שלך מוכן. מעביר אותך לפלטפורמה...</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">הצטרפות לקהילה</h2>
                    <p className="text-sm text-muted-foreground">
                      הוזמנת על ידי <span className="font-medium text-foreground">{mentorName}</span>
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email field */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">כתובת מייל</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="your@email.com"
                      dir="ltr"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-left"
                      autoFocus={!prefillEmail}
                    />
                  </div>

                  {/* Password field */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">בחר/י סיסמה</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="לפחות 6 תווים"
                        className="w-full h-11 px-4 pl-11 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                        autoFocus={!!prefillEmail}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(v => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">אמת/י סיסמה</label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="חזור/י על הסיסמה"
                      className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 active:opacity-80 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? '...' : 'הצטרף/י לקהילה'}
                  </button>
                </form>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
