import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TransitionProvider } from "@/contexts/TransitionContext";
import { LayoutGroup, AnimatePresence } from "framer-motion";
import DashboardReveal from "@/components/DashboardReveal";
import AuthPage from "./pages/AuthPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import MentorDashboard from "./pages/MentorDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import StudentQuizPage from "./pages/StudentQuizPage";
import MentorQuizEditor from "./pages/MentorQuizEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

function LoadingSpinner({ text = "טוען..." }: { text?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-secondary-foreground" dir="rtl">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
          <svg className="w-5 h-5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
            <polyline points="16,7 22,7 22,13" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (window.location.pathname === '/accept-invite') {
    return (
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<AcceptInvitePage />} />
      </Routes>
    );
  }

  // Determine the current "phase" for shared layout animation
  const phase = !user ? 'auth' : !role ? 'loading-role' : 'dashboard';

  return (
    <LayoutGroup>
      <AnimatePresence mode="wait">
        {phase === 'auth' && (
          <Routes key="auth-routes">
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        )}

        {phase === 'loading-role' && (
          <LoadingSpinner key="loading-role" text="טוען פרופיל..." />
        )}

        {phase === 'dashboard' && (
          <DashboardReveal key="dashboard">
            <Routes>
              <Route
                path="/"
                element={role === 'mentor' ? <MentorDashboard /> : <StudentDashboard />}
              />
              <Route path="/quiz/:quizId" element={<StudentQuizPage />} />
              <Route path="/mentor/quiz/new" element={<MentorQuizEditor />} />
              <Route path="/mentor/quiz/edit/:quizId" element={<MentorQuizEditor />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/auth" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DashboardReveal>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TransitionProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </TransitionProvider>
  </QueryClientProvider>
);

export default App;
