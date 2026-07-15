import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { getStoredAccessToken } from '@/lib/authToken';
import { TrendingUp, GraduationCap, Eye, EyeOff, CheckCircle } from 'lucide-react';

// Public project identifiers (same values as integrations/supabase/client.ts).
const SUPABASE_URL = 'https://dnsguhzzgxvymtjrraok.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2d1aHp6Z3h2eW10anJyYW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MTA2MjAsImV4cCI6MjA5MzI4NjYyMH0.5llm0eyAmfbHi19YHYnUc2nHDi1yITpXrw-ccKcEyms';
const AUTH_STORAGE_KEY = 'sb-dnsguhzzgxvymtjrraok-auth-token';

// The recovery/invite link puts the access token in the URL hash (implicit flow).
// supabase-js clears the hash once it processes it, so fall back to the persisted
// session. Both reads are lock-free — critical here, because loading a page with a
// recovery token wedges supabase-js's auth lock, so supabase.auth.getSession()
// hangs forever (that is exactly what froze this "join" button).
function recoveryToken(): string | null {
  const m = (window.location.hash || '').match(/access_token=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return getStoredAccessToken()?.token ?? null;
}

// Read the `sub` (user id) claim from a JWT without verifying it — RLS re-checks
// it server-side, so this is only to fill student_id on the membership row.
function jwtSub(token: string): string | null {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p)))).sub ?? null;
  } catch {
    return null;
  }
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
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
      // Everything here is raw fetch, never supabase.auth.* — the recovery token
      // in the URL wedges the client's auth lock, so any SDK auth call hangs.
      const token = recoveryToken();
      if (!token) {
        throw new Error('קישור ההזמנה פג תוקף או שכבר נעשה בו שימוש. בקש/י הזמנה חדשה מהמנטור.');
      }
      const authHeaders = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // 1. Set the chosen password on the invited account (bounded so a stall errors).
      const pwCtrl = new AbortController();
      const pwTimer = setTimeout(() => pwCtrl.abort(), 20_000);
      let pwRes: Response;
      try {
        pwRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT', headers: authHeaders, body: JSON.stringify({ password }), signal: pwCtrl.signal,
        });
      } catch (err) {
        throw new Error(err instanceof Error && err.name === 'AbortError'
          ? 'קביעת הסיסמה נתקעה. בדוק/י את החיבור ונסה/י שוב.'
          : 'לא ניתן להגיע לשרת. בדוק/י את החיבור ונסה/י שוב.');
      } finally {
        clearTimeout(pwTimer);
      }
      if (!pwRes.ok) {
        const body = await pwRes.json().catch(() => null);
        throw new Error(pwRes.status === 401 || pwRes.status === 403
          ? 'קישור ההזמנה פג תוקף. בקש/י הזמנה חדשה מהמנטור.'
          : (body?.msg || body?.error_description || 'קביעת הסיסמה נכשלה. נסה/י שוב.'));
      }

      // 2. Join the mentor's community (best-effort: if it fails, the student can
      //    still accept the pending invite from their dashboard after logging in).
      if (mentorId) {
        const studentId = jwtSub(token);
        if (studentId) {
          await fetch(`${SUPABASE_URL}/rest/v1/community_members`, {
            method: 'POST',
            headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({ student_id: studentId, mentor_id: mentorId }),
          }).catch(() => { /* non-fatal */ });
        }
      }

      // 3. Drop the temporary recovery session (lock-free) and send them to a clean
      //    login, where they sign in fresh with the password they just set. A full
      //    reload is deliberate: it starts a new JS context with no wedged lock.
      try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* storage disabled */ }
      setDone(true);
      setTimeout(() => { window.location.assign(import.meta.env.BASE_URL); }, 2000);
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
        className="w-full max-w-[480px]"
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
                <p className="text-sm text-muted-foreground">החשבון שלך מוכן. מעביר אותך למסך הכניסה — התחבר/י עם המייל והסיסמה שבחרת.</p>
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
                      className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-left"
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
                        className="w-full h-[46px] px-4 pl-11 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
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
                      className="w-full h-[46px] px-4 aurora-field rounded-2xl text-foreground placeholder:text-[#5f7680] transition-all text-right"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[46px] aurora-gold rounded-2xl font-bold transition-all disabled:cursor-not-allowed mt-2"
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
