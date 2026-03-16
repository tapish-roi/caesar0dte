import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, User, GraduationCap, Eye, EyeOff } from 'lucide-react';

type Tab = 'mentor' | 'student';
type Mode = 'login' | 'signup';

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>('student');
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role: tab },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.user && phone) {
          await supabase.from('profiles').update({ phone }).eq('user_id', data.user.id);
        }
        // Don't show toast here — AuthContext redirect handles it
        // Just clear loading; redirect happens via App.tsx when role is set
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Redirect happens reactively via App.tsx once role loads
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'שגיאה לא צפויה';
      toast({ title: 'שגיאה', description: message, variant: 'destructive' });
      setLoading(false); // Only clear on error; success navigates away
    }
    // Note: on success we intentionally leave loading=true while redirect happens
    // App.tsx will unmount this component once role is resolved
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden auth-bg">
      {/* Soft radial gradient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.12]"
          style={{ background: 'radial-gradient(circle, hsl(160 84% 39%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, hsl(222 47% 40%) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] opacity-[0.05]"
          style={{ background: 'radial-gradient(ellipse, hsl(160 84% 39%) 0%, transparent 60%)' }}
        />
      </div>


      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-[480px]"
      >
        {/* Logo / Brand */}
        <div className="text-center mb-8 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">TradeLearn</h1>
          <p className="text-sm text-muted-foreground">פלטפורמת מנטורינג למסחר מקצועי</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl card-shadow overflow-hidden">
          {/* Role Toggle */}
          <div className="flex border-b border-border">
            {([
              { key: 'student', label: 'כניסת תלמיד', icon: GraduationCap },
              { key: 'mentor', label: 'כניסת מנטור', icon: User },
            ] as { key: Tab; label: string; icon: typeof User }[]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-all relative ${
                  tab === key
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
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
            {/* Mode Sub-toggle */}
            <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6">
              {([
                { key: 'login', label: 'כניסה' },
                { key: 'signup', label: 'הרשמה' },
              ] as { key: Mode; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                    mode === key
                      ? 'bg-card text-foreground card-shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Headline */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${tab}-${mode}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.2 }}
                className="mb-6"
              >
                <h2 className="text-xl font-bold text-foreground">
                  {tab === 'mentor'
                    ? mode === 'login' ? 'ברוך הבא, מנטור' : 'צור חשבון מנטור'
                    : mode === 'login' ? 'המסע שלך מתחיל כאן' : 'הצטרף לקהילת הלמידה'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {tab === 'mentor'
                    ? mode === 'login' ? 'נהל את הקהילה והשיעורים שלך' : 'בנה קהילת תלמידים ועצב קורסים'
                    : mode === 'login' ? 'המשך את מסע הלמידה שלך' : 'המסע שלך למסחר מקצועי מתחיל כאן.'}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence>
                {mode === 'signup' && (
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
                        className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">טלפון (אופציונלי)</label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="050-0000000"
                        className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
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
                  className="w-full h-11 px-4 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
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
                    className="w-full h-11 px-4 pl-11 bg-surface border-none ring-1 ring-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-all text-right"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 active:opacity-80 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? '...' : mode === 'login' ? 'כניסה' : 'צור חשבון'}
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-6">
              {mode === 'login' ? 'אין לך חשבון?' : 'כבר רשום?'}{' '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-accent font-medium hover:underline"
              >
                {mode === 'login' ? 'הירשם עכשיו' : 'כנס לחשבון'}
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
