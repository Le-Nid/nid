import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "./store/auth.store";
import AppShell from "./components/app/AppShell";
import { RequireGmailAccess } from "./components/app/RequireGmailAccess";
import LegacyAntd from "./components/LegacyAntd";
import { Skeleton } from "./components/ui/skeleton";

const LoginPage = lazy(() => import("./pages/Login"));
const OverviewPage = lazy(() => import("./pages/Overview"));
const MailsPage = lazy(() => import("./pages/Mails"));
const ArchivesPage = lazy(() => import("./pages/Archives"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const ActivityPage = lazy(() => import("./pages/Activity"));
const MorePage = lazy(() => import("./pages/More"));
const RulesPage = lazy(() => import("./pages/Rules"));
const AdminPage = lazy(() => import("./pages/Admin"));
const CleanupPage = lazy(() => import("./pages/Cleanup"));
const AttachmentsPage = lazy(() => import("./pages/Attachments"));
const SavedSearchesPage = lazy(() => import("./pages/SavedSearches"));
const UnifiedInboxPage = lazy(() => import("./pages/UnifiedInbox"));
const SharedMailPage = lazy(() => import("./pages/SharedMail"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const initialLoading = useAuthStore((s) => s.initialLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (initialLoading) return <RouteFallback />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== "admin") return <Navigate to="/overview" replace />;
  return <>{children}</>;
}

// Skeleton, not a spinner (I1)
function RouteFallback() {
  const { t } = useTranslation();
  return (
    <output aria-label={t("shell.loading")} className="flex flex-col gap-3 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </output>
  );
}

/** §3.3 redirects keep the query string (e.g. /settings?gmail=connected from the OAuth callback). */
function Redirect({ to }: Readonly<{ to: string }>) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

/** Pages not migrated yet (§9.1): antd context plus the gutter and background AppLayout gave them. */
function LegacyPages() {
  return (
    // shortcut: AppLayout's hardcoded content backgrounds, dropped with the last antd page (L10)
    <div className="flex-1 bg-[#f5f5f5] p-3 md:p-6 dark:bg-[#1f1f1f]">
      <LegacyAntd>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </LegacyAntd>
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
        <Route path="/shared/:token" element={<SharedMailPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route element={<LegacyPages />}>
            {/* New routes (§3.1), rendering the legacy page until its lot lands */}
            {/* Legacy routes whose destination does not exist yet: redirected in their lot (§3.3) */}
            <Route path="saved-searches" element={<SavedSearchesPage />} />
            <Route path="unified" element={<UnifiedInboxPage />} />
          </Route>
          {/* Migrated pages (§9.2): no antd context; own Suspense so the shell stays while the chunk loads */}
          <Route path="overview" element={<RequireGmailAccess title="shell.overview"><Suspense fallback={<RouteFallback />}><OverviewPage /></Suspense></RequireGmailAccess>} />
          <Route path="mails" element={<RequireGmailAccess title="mails.title"><Suspense fallback={<RouteFallback />}><MailsPage /></Suspense></RequireGmailAccess>} />
          <Route path="cleanup" element={<RequireGmailAccess title="cleanup.title"><Suspense fallback={<RouteFallback />}><CleanupPage /></Suspense></RequireGmailAccess>} />
          <Route path="rules" element={<RequireGmailAccess title="rules.title"><Suspense fallback={<RouteFallback />}><RulesPage /></Suspense></RequireGmailAccess>} />
          <Route path="archives" element={<Suspense fallback={<RouteFallback />}><ArchivesPage /></Suspense>} />
          <Route path="attachments" element={<Suspense fallback={<RouteFallback />}><AttachmentsPage /></Suspense>} />
          <Route path="activity" element={<Suspense fallback={<RouteFallback />}><ActivityPage /></Suspense>} />
          <Route path="settings/:section" element={<Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense>} />
          <Route path="more" element={<Suspense fallback={<RouteFallback />}><MorePage /></Suspense>} />
          <Route path="admin" element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminPage /></Suspense></AdminRoute>} />
          {/* §3.3 redirects whose target exists in L0 */}
          <Route index element={<Redirect to="/overview" />} />
          <Route path="dashboard" element={<Redirect to="/overview" />} />
          <Route path="analytics" element={<Redirect to="/overview" />} />
          <Route path="insights" element={<Redirect to="/overview" />} />
          <Route path="archive" element={<Redirect to="/archives" />} />
          <Route path="jobs" element={<Redirect to="/activity" />} />
          <Route path="settings" element={<Redirect to="/settings/account" />} />
          <Route path="ops" element={<Redirect to="/settings/data" />} />
          <Route path="unsubscribe" element={<Navigate to="/cleanup?tab=senders" replace />} />
          <Route path="expiration" element={<Navigate to="/rules?tab=labels" replace />} />
          <Route path="sharing" element={<Navigate to="/archives?tab=shares" replace />} />
          <Route path="privacy" element={<Navigate to="/settings/account" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
