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

function LoadingSpinner({ text = "טוען..." }: { text?: string }) {
  return (
    <motion.div
      key="spinner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: premiumEase }}
      className="min-h-screen bg-background flex items-center justify-center text-secondary-foreground"
      dir="rtl"
    >
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
          <svg className="w-5 h-5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
            <polyline points="16,7 22,7 22,13" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
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

  // Determine the current "phase" for shared layout animation
  const isAcceptInvite = typeof window !== 'undefined' && window.location.pathname === '/accept-invite';
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
