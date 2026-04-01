import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router";
import { Spin } from "antd";
import { useAuthStore } from "./store/auth.store";
import AppLayout from "./components/AppLayout";

const LoginPage = lazy(() => import("./pages/Login"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const MailManagerPage = lazy(() => import("./pages/MailManager"));
const ArchivePage = lazy(() => import("./pages/Archive"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const JobsPage = lazy(() => import("./pages/Jobs"));
const RulesPage = lazy(() => import("./pages/Rules"));
const AdminPage = lazy(() => import("./pages/Admin"));
const UnsubscribePage = lazy(() => import("./pages/Unsubscribe"));
const AttachmentsPage = lazy(() => import("./pages/Attachments"));
const InsightsPage = lazy(() => import("./pages/Insights"));
const DuplicatesPage = lazy(() => import("./pages/Duplicates"));
const PrivacyPage = lazy(() => import("./pages/Privacy"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const initialLoading = useAuthStore((s) => s.initialLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (initialLoading) return <RouteFallback />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div aria-live="polite" aria-label="Chargement" style={{ minHeight: "40vh", display: "grid", placeItems: "center" }}>
      <Spin size="large" />
    </div>
  );
}

export default function App() {
  const { fetchMe } = useAuthStore();

  useEffect(() => {
    // Try to restore session from httpOnly cookie
    fetchMe();
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
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
          <Route path="unsubscribe" element={<UnsubscribePage />} />
          <Route path="attachments" element={<AttachmentsPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="duplicates" element={<DuplicatesPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
