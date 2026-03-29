import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
       <div className="min-h-screen bg-background flex items-center justify-center text-secondary-foreground" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
            <svg className="w-5 h-5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
              <polyline points="16,7 22,7 22,13" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  // Always allow /accept-invite regardless of auth state
  // (student arrives from invite email — may or may not have a session)
  if (window.location.pathname === '/accept-invite') {
    return (
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<AcceptInvitePage />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // User is authenticated but role hasn't loaded yet — keep showing spinner
  if (!role) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-secondary-foreground" dir="rtl">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mx-auto animate-pulse">
            <svg className="w-5 h-5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22,7 13.5,15.5 8.5,10.5 2,17" />
              <polyline points="16,7 22,7 22,13" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">טוען פרופיל...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          role === 'mentor' ? <MentorDashboard /> :
          <StudentDashboard />
        }
      />
      <Route path="/quiz/:quizId" element={<StudentQuizPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
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
