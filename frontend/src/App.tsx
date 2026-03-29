import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";
import LoginPage from "./pages/Login";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/Dashboard";
import MailManagerPage from "./pages/MailManager";
import ArchivePage from "./pages/Archive";
import SettingsPage from "./pages/Settings";
import JobsPage from "./pages/Jobs";
import RulesPage from "./pages/Rules";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token) fetchMe();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="mails" element={<MailManagerPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
