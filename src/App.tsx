import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import DashboardReveal from "@/components/DashboardReveal";
import LightspeedTransition from "@/components/LightspeedTransition";
// AuthPage stays eager — it's the first paint for logged-out users
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "@/components/ProtectedRoute";

// Route-level code splitting — each page loads only when navigated to
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const MentorDashboard = lazy(() => import("./pages/MentorDashboard"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const StudentQuizPage = lazy(() => import("./pages/StudentQuizPage"));
const MentorQuizEditor = lazy(() => import("./pages/MentorQuizEditor"));
const LivestreamPage = lazy(() => import("./pages/LivestreamPage"));
const JournalPage = lazy(() => import("./pages/JournalPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

const premiumEase = [0.22, 1, 0.36, 1] as const;

// Decorative starfield — fixed positions so the layout is deterministic.
const LOADING_STARS = [
  { top: '12%', left: '14%', size: 2, color: '#dfe9ec', anim: 'ls-twinkle-a', dur: '3.4s', delay: '0s', glow: true },
  { top: '24%', left: '78%', size: 1.5, color: '#9db4bc', anim: 'ls-twinkle-b', dur: '2.8s', delay: '.4s' },
  { top: '66%', left: '20%', size: 1.5, color: '#9db4bc', anim: 'ls-twinkle-a', dur: '4.1s', delay: '.9s' },
  { top: '78%', left: '64%', size: 2, color: '#dfe9ec', anim: 'ls-twinkle-b', dur: '3.1s', delay: '.2s', glow: true },
  { top: '38%', left: '88%', size: 1.5, color: '#5ac8e6', anim: 'ls-twinkle-a', dur: '3.8s', delay: '1.3s', opacity: 0.6 },
  { top: '15%', left: '44%', size: 1, color: '#9db4bc', anim: 'ls-twinkle-b', dur: '2.5s', delay: '.7s' },
  { top: '55%', left: '8%', size: 1, color: '#5ac8e6', anim: 'ls-twinkle-a', dur: '3s', delay: '1.6s', opacity: 0.5 },
  { top: '86%', left: '36%', size: 1.5, color: '#9db4bc', anim: 'ls-twinkle-b', dur: '3.6s', delay: '1.1s' },
  { top: '8%', left: '62%', size: 1, color: '#dfe9ec', anim: 'ls-twinkle-a', dur: '2.7s', delay: '.5s', opacity: 0.55 },
  { top: '47%', left: '70%', size: 1, color: '#9db4bc', anim: 'ls-twinkle-b', dur: '4.4s', delay: '1.8s' },
  { top: '70%', left: '90%', size: 1.5, color: '#dfe9ec', anim: 'ls-twinkle-a', dur: '3.3s', delay: '.3s', opacity: 0.5 },
  { top: '30%', left: '6%', size: 1, color: '#dfe9ec', anim: 'ls-twinkle-b', dur: '3.9s', delay: '1.4s', opacity: 0.45 },
] as const;

function LoadingSpinner({ text = "טוען..." }: { text?: string }) {
  // The trailing ellipsis is animated by the .ls-dots pseudo-element.
  const label = text.replace(/\.+$/, '');

  return (
    <motion.div
      key="spinner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: premiumEase }}
      className="ls-screen relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(1100px 700px at 50% 38%, #0b1420 0%, #070d16 60%, #05090f 100%)' }}
      dir="rtl"
    >
      {/* aurora tint washes */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(560px 340px at 50% 30%, rgba(226,181,78,.055), transparent 70%), radial-gradient(700px 420px at 78% 78%, rgba(90,200,230,.045), transparent 70%)',
        }}
      />

      {/* starfield */}
      <div className="absolute inset-0 pointer-events-none">
        {LOADING_STARS.map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              background: star.color,
              opacity: 'opacity' in star ? star.opacity : undefined,
              boxShadow: 'glow' in star ? '0 0 6px rgba(223,233,236,.75)' : undefined,
              animation: `${star.anim} ${star.dur} ease-in-out ${star.delay} infinite`,
            }}
          />
        ))}
      </div>

      {/* center stack */}
      <div className="relative flex flex-col items-center" style={{ gap: 26 }}>
        {/* mark: gradient ring + orbiting spark + rocket */}
        <div className="relative w-[104px] h-[104px] flex items-center justify-center">
          <div
            className="absolute rounded-full"
            style={{
              inset: 14,
              background: 'radial-gradient(circle, rgba(226,181,78,.28), transparent 68%)',
              filter: 'blur(10px)',
              animation: 'ls-glow 2.6s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '3px solid transparent',
              background:
                'linear-gradient(#0a1320,#0a1320) padding-box, linear-gradient(150deg,#f0cc70,#c9962a 55%,rgba(90,200,230,.55)) border-box',
              boxShadow: '0 10px 34px -10px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07)',
            }}
          />
          <div className="absolute inset-0" style={{ animation: 'ls-orbit 2.4s linear infinite' }}>
            <div
              className="absolute rounded-full"
              style={{
                top: -4,
                left: '50%',
                width: 8,
                height: 8,
                marginLeft: -4,
                background: '#f0cc70',
                boxShadow: '0 0 14px 4px rgba(240,204,112,.65)',
              }}
            />
          </div>
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f0cc70"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: 'ls-float 3.2s ease-in-out infinite',
              filter: 'drop-shadow(0 0 10px rgba(240,204,112,.35))',
            }}
          >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        </div>

        {/* brand + status */}
        <div className="flex flex-col items-center" style={{ gap: 10 }}>
          <div
            dir="ltr"
            style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.46em',
              textIndent: '.46em',
              color: '#63808a',
            }}
          >
            CAESAR · 0DTE LAB
          </div>
          <div className="flex items-baseline" style={{ fontSize: 15, fontWeight: 500, color: '#9db4bc' }}>
            <span>{label}</span>
            <span className="ls-dots" />
          </div>
        </div>

        {/* gradient shimmer bar */}
        <div
          className="relative overflow-hidden"
          style={{ width: 160, height: 2, borderRadius: 2, background: 'rgba(130,180,200,.12)' }}
        >
          <div
            className="absolute inset-0"
            style={{
              width: 64,
              borderRadius: 2,
              background: 'linear-gradient(90deg, transparent, #e2b54e 40%, #5ac8e6 70%, transparent)',
              animation: 'ls-sweep 1.5s ease-in-out infinite alternate',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function AppRoutes() {
  const { user, role, loading, session } = useAuth();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null>(null);
  const [roleCheckPending, setRoleCheckPending] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('auth_role_check') === 'pending'
  );

  // Listen for role-check guard changes
  useEffect(() => {
    const handler = () => {
      setRoleCheckPending(sessionStorage.getItem('auth_role_check') === 'pending');
    };
    window.addEventListener('storage', handler);
    // Same-tab writes don't fire 'storage' — writers dispatch this custom event instead
    window.addEventListener('auth-role-check-changed', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('auth-role-check-changed', handler);
    };
  }, []);

  // Invalidate all cached queries when the user identity changes (login/logout/account switch).
  // Routine token refreshes for the same user keep the cache — data is user-scoped, not token-scoped.
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    if (prevUserIdRef.current !== userId) {
      queryClient.invalidateQueries();
    }
    prevUserIdRef.current = userId;
  }, [session?.user?.id, queryClient]);

  // Determine the current "phase" for shared layout animation.
  // endsWith (not ===) so it matches under the GitHub Pages "/caesar0dte/"
  // sub-path too: the live path is "/caesar0dte/accept-invite". The exact-match
  // bug meant the invite landing never rendered on the deployed site, so a
  // clicked invite link fell through to the dashboard instead of the password
  // setup screen. Mirrors the isResetPassword check below.
  const isAcceptInvite = typeof window !== 'undefined' && window.location.pathname.endsWith('/accept-invite');
  // Password-recovery landing. endsWith so it matches under the GitHub Pages
  // "/caesar0dte/" sub-path too. Handled before auth-phase gating because the
  // recovery token creates a session that would otherwise route to a dashboard.
  const isResetPassword = typeof window !== 'undefined' && window.location.pathname.endsWith('/reset-password');
  const phase: 'auth' | 'loading-role' | 'dashboard' = loading
    ? 'auth'
    : (!user || roleCheckPending)
      ? 'auth'
      : !role
        ? 'loading-role'
        : 'dashboard';

  // Lightspeed jump — fires once when transitioning into dashboard from auth/loading-role
  const prevPhaseRef = useRef(phase);
  const [lightspeedActive, setLightspeedActive] = useState(false);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (phase === 'dashboard' && prev !== 'dashboard' && !isAcceptInvite) {
      setLightspeedActive(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, isAcceptInvite]);

  if (isResetPassword) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<ResetPasswordPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (loading) return <LoadingSpinner />;

  if (isAcceptInvite) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<AcceptInvitePage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <LayoutGroup>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'auth' && (
          <motion.div key="auth" exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: premiumEase }}>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route path="*" element={<Navigate to="/auth" replace />} />
              </Routes>
            </Suspense>
          </motion.div>
        )}

        {phase === 'loading-role' && (
          <LoadingSpinner key="loading-role" text="טוען פרופיל..." />
        )}

        {phase === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: premiumEase }}>
            <DashboardReveal>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route
                    path="/"
                    element={role === 'mentor' ? <MentorDashboard /> : <StudentDashboard />}
                  />
                  <Route path="/quiz/:quizId" element={<StudentQuizPage />} />
                  <Route path="/mentor/quiz/new" element={<MentorQuizEditor />} />
                  <Route path="/mentor/quiz/edit/:quizId" element={<MentorQuizEditor />} />
                  <Route path="/livestream" element={<LivestreamPage />} />
                  <Route path="/journal" element={<ProtectedRoute><JournalPage /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute><JournalPage /></ProtectedRoute>} />
                  <Route path="/analytics" element={<ProtectedRoute><JournalPage /></ProtectedRoute>} />
                  <Route path="/accept-invite" element={<AcceptInvitePage />} />
                  <Route path="/auth" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </DashboardReveal>
          </motion.div>
        )}
      </AnimatePresence>

      {lightspeedActive && (
        <LightspeedTransition onDone={() => setLightspeedActive(false)} />
      )}
    </LayoutGroup>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
