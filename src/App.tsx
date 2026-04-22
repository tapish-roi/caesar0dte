import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LayoutGroup, AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import DashboardReveal from "@/components/DashboardReveal";
import LightspeedTransition from "@/components/LightspeedTransition";
import AuthPage from "./pages/AuthPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import MentorDashboard from "./pages/MentorDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import StudentQuizPage from "./pages/StudentQuizPage";
import MentorQuizEditor from "./pages/MentorQuizEditor";
import LivestreamPage from "./pages/LivestreamPage";
import JournalPage from "./pages/JournalPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";

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
  const prevTokenRef = useRef<string | null>(null);
  const [roleCheckPending, setRoleCheckPending] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('auth_role_check') === 'pending'
  );

  // Listen for role-check guard changes
  useEffect(() => {
    const handler = () => {
      setRoleCheckPending(sessionStorage.getItem('auth_role_check') === 'pending');
    };
    window.addEventListener('storage', handler);
    // Also poll briefly since sessionStorage events don't fire in same tab
    const interval = setInterval(handler, 200);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);

  // Invalidate all cached queries when the access token changes (login/logout/session refresh)
  useEffect(() => {
    const token = session?.access_token ?? null;
    if (prevTokenRef.current !== null && prevTokenRef.current !== token) {
      queryClient.invalidateQueries();
    }
    if (token !== null && prevTokenRef.current === null) {
      // First time we get a real token — invalidate stale anon-key results
      queryClient.invalidateQueries();
    }
    prevTokenRef.current = token;
  }, [session?.access_token, queryClient]);

  // Determine the current "phase" for shared layout animation
  const isAcceptInvite = typeof window !== 'undefined' && window.location.pathname === '/accept-invite';
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

  if (loading) return <LoadingSpinner />;

  if (isAcceptInvite) {
    return (
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<AcceptInvitePage />} />
      </Routes>
    );
  }

  return (
    <LayoutGroup>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'auth' && (
          <motion.div key="auth" exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: premiumEase }}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="*" element={<Navigate to="/auth" replace />} />
            </Routes>
          </motion.div>
        )}

        {phase === 'loading-role' && (
          <LoadingSpinner key="loading-role" text="טוען פרופיל..." />
        )}

        {phase === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: premiumEase }}>
            <DashboardReveal>
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
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
