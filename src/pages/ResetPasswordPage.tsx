import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

/**
 * ResetPasswordPage — landing target for the Supabase password-recovery email.
 *
 * The recovery link redirects here with the token in the URL hash. supabase-js
 * (detectSessionInUrl defaults on) parses it, establishes a recovery session,
 * and fires PASSWORD_RECOVERY. We then let the user choose a new password via
 * auth.updateUser(), sign them out, and send them to the login screen.
 *
 * The reset link is built with import.meta.env.BASE_URL, so this works both at
 * root (dev / custom domain) and under the GitHub Pages "/caesar0dte/" sub-path.
 */
export default function ResetPasswordPage() {
  const { toast } = useToast();

  // The recovery link lands here with a URL hash (recovery token, or an
  // error like otp_expired). That hash desyncs react-router's history, so a
  // client-side navigate('/auth') is a silent no-op — which is why the "return
  // to login" button appeared dead. A hard load to the app base leaves the
  // broken state entirely: it clears the dangling hash and any wedged
  // supabase auth lock, then lands on the login screen. BASE_URL is "/" in dev
  // and "/caesar0dte/" under the GitHub Pages sub-path.
  const goToLogin = () => { window.location.href = import.meta.env.BASE_URL; };

  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const hasRecoveryToken = hash.includes('access_token') || hash.includes('type=recovery');

    let resolved = false;
    const markReady = () => { resolved = true; setStatus('ready'); };

    // A recovery session may be established either just before or just after this
    // effect runs, so we both listen for the event and check the current session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) markReady();
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) markReady();
    });

    // No token in the URL and no existing session → the link is missing/expired.
    // With a token present, give Supabase a few seconds to exchange it.
    const timeout = setTimeout(() => {
      if (!resolved) setStatus('invalid');
    }, hasRecoveryToken ? 6000 : 1500);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      // Sign out so the user logs in fresh with the new password.
      await supabase.auth.signOut();
      setTimeout(goToLogin, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה לא צפויה';
      toast({ title: 'שגיאה', description: message, variant: 'destructive' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden auth-bg" dir="rtl">
      {/* Background blobs (match AcceptInvitePage) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.15]"
          style={{ background: 'radial-gradient(circle, hsl(42 70% 50%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, hsl(220 30% 30%) 0%, transparent 70%)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[480px] relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-secondary-foreground">Caesar 0 DTE</h1>
          <p className="text-sm text-secondary-foreground/60">פלטפורמת מנטורינג למסחר מקצועי</p>
        </div>

        <div className="bg-card rounded-2xl card-shadow overflow-hidden">
          <div className="p-8">
            {status === 'checking' && (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">מאמת את קישור האיפוס...</p>
              </div>
            )}

            {status === 'invalid' && (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <h2 className="text-xl font-bold text-foreground">הקישור אינו תקין</h2>
                <p className="text-sm text-muted-foreground">
                  קישור איפוס הסיסמה פג תוקף או שכבר נעשה בו שימוש. בקש/י קישור חדש ממסך הכניסה.
                </p>
                <button
                  onClick={goToLogin}
                  className="w-full h-[46px] bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 active:opacity-80 transition-all mt-2"
                >
                  חזרה לכניסה
                </button>
              </div>
            )}

            {status === 'ready' && (done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7 text-accent" />
                </div>
                <h2 className="text-xl font-bold text-foreground">הסיסמה עודכנה!</h2>
                <p className="text-sm text-muted-foreground">מעביר אותך למסך הכניסה...</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">איפוס סיסמה</h2>
                    <p className="text-sm text-muted-foreground">בחר/י סיסמה חדשה לחשבון שלך</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">סיסמה חדשה</label>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="לפחות 6 תווים"
                        autoFocus
                        className="w-full h-[46px] px-4 pl-11 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
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

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">אימות סיסמה</label>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="חזור/י על הסיסמה"
                      className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[46px] aurora-gold rounded-2xl font-bold transition-all disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'עדכן סיסמה'}
                  </button>
                </form>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
