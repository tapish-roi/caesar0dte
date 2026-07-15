import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, User, GraduationCap, Eye, EyeOff, Info, Loader2, ArrowRight, CheckCircle } from 'lucide-react';
import PlanetBackground from '@/components/PlanetBackground';

type Tab = 'mentor' | 'student';
type MentorMode = 'login' | 'signup';

const SUPABASE_URL = "https://dnsguhzzgxvymtjrraok.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2d1aHp6Z3h2eW10anJyYW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MTA2MjAsImV4cCI6MjA5MzI4NjYyMH0.5llm0eyAmfbHi19YHYnUc2nHDi1yITpXrw-ccKcEyms";
const premiumEase = [0.22, 1, 0.36, 1] as const;

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('student');
  const [mentorMode, setMentorMode] = useState<MentorMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  // Forgot-password sub-flow (shared across both tabs)
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { toast } = useToast();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      // Build the redirect from BASE_URL so it lands on our reset page whether the
      // app is served at root (dev / custom domain) or under the "/caesar0dte/"
      // GitHub Pages sub-path. This URL must be allow-listed in Supabase Auth.
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה לא צפויה';
      toast({ title: 'שגיאה', description: message, variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotSent(false);
    setForgotEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Set guard flag to prevent AuthContext from navigating away during role check
      sessionStorage.setItem('auth_role_check', 'pending');
      window.dispatchEvent(new Event('auth-role-check-changed'));

      if (tab === 'mentor' && mentorMode === 'signup') {
        // Mentor signup — use Edge Function to create user + profile + role atomically
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-mentor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ email, password, fullName, phone }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'שגיאה ביצירת החשבון');

        // Sign in after successful creation
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        // Mentor login OR Student login — plain signIn
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error(
              tab === 'student'
                ? 'אימייל או סיסמה שגויים. שים לב — תלמידים מקבלים גישה רק דרך הזמנת המנטור.'
                : 'אימייל או סיסמה שגויים.'
            );
          }
          throw error;
        }

        // Verify role matches the selected tab
        const userId = data.user?.id;
        if (userId) {
          const metaRole = data.user?.user_metadata?.role as string | undefined;
          let userRole = metaRole;

          // If no metadata role, check DB
          if (userRole !== 'mentor' && userRole !== 'student') {
            const { data: dbRole } = await supabase.rpc('get_user_role', { _user_id: userId });
            userRole = dbRole ?? undefined;
          }

          if (tab === 'student' && userRole !== 'student') {
            await supabase.auth.signOut();
            setEmail('');
            setPassword('');
            setLoading(false);
            setTab('mentor');
            toast({ title: 'שגיאה', description: 'חשבון זה שייך למנטור. מעביר אותך ללשונית המנטור.', variant: 'destructive' });
            return;
          }
          if (tab === 'mentor' && userRole !== 'mentor') {
            await supabase.auth.signOut();
            setEmail('');
            setPassword('');
            setLoading(false);
            setTab('student');
            toast({ title: 'שגיאה', description: 'חשבון זה שייך לתלמיד. מעביר אותך ללשונית התלמיד.', variant: 'destructive' });
            return;
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה לא צפויה';
      toast({ title: 'שגיאה', description: message, variant: 'destructive' });
      setLoading(false);
    } finally {
      sessionStorage.removeItem('auth_role_check');
      window.dispatchEvent(new Event('auth-role-check-changed'));
    }
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: premiumEase }}
    >
      {/* Live 3D planet scene behind the login card (same background as the
          dashboards), so the space theme is visible before signing in. */}
      <PlanetBackground activePlanet="earth" />

      {/* Background blobs */}
      <motion.div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.6, ease: premiumEase }}
      >
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.15]"
          style={{ background: 'radial-gradient(circle, hsl(42 70% 50%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, hsl(220 30% 30%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse, hsl(42 70% 50%) 0%, transparent 60%)' }}
        />
      </motion.div>

      <div className="w-full max-w-[480px] relative z-10">
        {/* Logo */}
        <motion.div
          className="text-center mb-8 flex flex-col items-center gap-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: premiumEase }}
        >
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-secondary-foreground">Caesar 0 DTE</h1>
          <p className="text-sm text-secondary-foreground/60">פלטפורמת מנטורינג למסחר מקצועי</p>
        </motion.div>

        {/* Card — shared layoutId with dashboard */}
        <motion.div
          layoutId="main-container"
          className="liquid-glass aurora-edge rounded-3xl overflow-hidden"
          style={{ borderRadius: 16 }}
          transition={{ layout: { duration: 0.7, ease: premiumEase } }}
        >
          {/* Role tabs */}
          <div className="flex border-b border-border">
            {([
              { key: 'student', label: 'כניסת תלמיד', icon: GraduationCap },
              { key: 'mentor', label: 'כניסת מנטור', icon: User },
            ] as { key: Tab; label: string; icon: typeof User }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-all relative ${
                  tab === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {tab === key && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="p-8">
            {forgotOpen ? (
              <motion.div key="forgot" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <button
                  type="button"
                  onClick={closeForgot}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>

                {forgotSent ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto">
                      <CheckCircle className="w-7 h-7 text-accent" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground">קישור נשלח</h2>
                    <p className="text-sm text-muted-foreground">
                      אם קיים חשבון עבור כתובת זו, נשלח אליו קישור לאיפוס הסיסמה. בדוק/י את תיבת הדואר
                      (וגם את תיקיית הספאם).
                    </p>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-foreground mb-1">איפוס סיסמה</h2>
                    <p className="text-sm text-muted-foreground mb-5">
                      הזן/י את כתובת המייל שלך ונשלח לך קישור לאיפוס הסיסמה.
                    </p>
                    <form onSubmit={handleForgot} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">אימייל</label>
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                          dir="ltr"
                          className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="w-full h-[46px] aurora-gold rounded-2xl font-bold transition-all disabled:cursor-not-allowed mt-2"
                      >
                        {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'שלח קישור איפוס'}
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            ) : (
            <AnimatePresence mode="wait">

              {/* ── STUDENT TAB ── */}
              {tab === 'student' && (
                <motion.div
                  key="student"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <h2 className="text-xl font-bold text-foreground mb-1">המסע שלך מתחיל כאן</h2>
                  <p className="text-sm text-muted-foreground mb-5">המשך את מסע הלמידה שלך</p>

                  {/* Info banner */}
                  <div className="flex items-start gap-3 aurora-alert aurora-alert-gold rounded-2xl px-4 py-3 mb-6">
                    <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-foreground">תלמידים מצטרפים רק דרך הזמנה מהמנטור.</span>
                      {' '}לאחר שהמנטור שולח לך הזמנה, תקבל/י מייל עם פרטי הכניסה ותוכל/י להתחבר כאן.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">אימייל</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">סיסמה</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          minLength={6}
                          placeholder="••••••••"
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
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-[46px] aurora-gold rounded-2xl font-bold transition-all disabled:cursor-not-allowed mt-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'כניסה'}
                    </button>
                  </form>
                  <div className="text-center mt-4">
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="text-sm text-accent font-medium hover:underline"
                    >
                      שכחתי סיסמה?
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── MENTOR TAB ── */}
              {tab === 'mentor' && (
                <motion.div
                  key="mentor"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Login / Signup sub-toggle */}
                  <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
                    {([
                      { key: 'login', label: 'כניסה' },
                      { key: 'signup', label: 'הרשמה' },
                    ] as { key: MentorMode; label: string }[]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMentorMode(key)}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                          mentorMode === key
                            ? 'bg-card text-foreground card-shadow'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mentorMode}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      transition={{ duration: 0.15 }}
                      className="mb-6"
                    >
                      <h2 className="text-xl font-bold text-foreground">
                        {mentorMode === 'login' ? 'ברוך הבא, מנטור' : 'צור חשבון מנטור'}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {mentorMode === 'login' ? 'נהל את הקהילה והשיעורים שלך' : 'בנה קהילת תלמידים ועצב קורסים'}
                      </p>
                    </motion.div>
                  </AnimatePresence>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <AnimatePresence>
                      {mentorMode === 'signup' && (
                        <motion.div
                          key="signup-fields"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-4 overflow-hidden"
                        >
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">שם מלא</label>
                            <input
                              type="text"
                              value={fullName}
                              onChange={e => setFullName(e.target.value)}
                              required
                              placeholder="ישראל ישראלי"
                              className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">טלפון (אופציונלי)</label>
                            <input
                              type="tel"
                              value={phone}
                              onChange={e => setPhone(e.target.value)}
                              placeholder="050-0000000"
                              className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">אימייל</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">סיסמה</label>
                      <div className="relative">
                        <input
                          type={showPass ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          minLength={6}
                          placeholder="••••••••"
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

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-[46px] aurora-gold rounded-2xl font-bold transition-all disabled:cursor-not-allowed mt-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : mentorMode === 'login' ? 'כניסה' : 'צור חשבון'}
                    </button>
                  </form>

                  {mentorMode === 'login' && (
                    <div className="text-center mt-4">
                      <button
                        type="button"
                        onClick={() => setForgotOpen(true)}
                        className="text-sm text-accent font-medium hover:underline"
                      >
                        שכחתי סיסמה?
                      </button>
                    </div>
                  )}

                  <p className="text-center text-xs text-muted-foreground mt-6">
                    {mentorMode === 'login' ? 'אין לך חשבון מנטור?' : 'כבר רשום?'}{' '}
                    <button
                      onClick={() => setMentorMode(mentorMode === 'login' ? 'signup' : 'login')}
                      className="text-accent font-medium hover:underline"
                    >
                      {mentorMode === 'login' ? 'הירשם עכשיו' : 'כנס לחשבון'}
                    </button>
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
