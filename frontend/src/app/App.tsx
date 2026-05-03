import { useEffect, useState, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

import AdminLayout from "../layouts/AdminLayout";
import MinisterLayout from "../layouts/MinisterLayout";
import AdminActivityPage from "../modules/admin/pages/AdminActivityPage";
import AdminOverviewPage from "../modules/admin/pages/AdminOverviewPage";
import AdminSystemPage from "../modules/admin/pages/AdminSystemPage";
import AdminUsersPage from "../modules/admin/pages/AdminUsersPage";
import MinisterDashboardPage from "../modules/minister/pages/MinisterDashboardPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import LoginPage from "../pages/LoginPage";
import NotFoundPage from "../pages/NotFoundPage";
import PasswordTokenPage from "../pages/PasswordTokenPage";
import SettingsPage from "../pages/SettingsPage";
import { authApi, SESSION_INVALID_EVENT } from "./api";
import {
  getAccessToken,
  getLastActivityAt,
  homeRouteForRole,
  isAuthed,
  isMinister,
  isSystemAdmin,
  logoutDummy,
  setAuthNotice,
  touchLastActivity,
} from "./auth";

const SESSION_IDLE_TIMEOUT_MS =
  (Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MINUTES || "30") || 30) *
  60 *
  1000;

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <Navigate to={homeRouteForRole()} replace />;
}

function RequireSystemAdmin({ children }: { children: ReactNode }) {
  if (!isSystemAdmin()) return <Navigate to={homeRouteForRole()} replace />;
  return <>{children}</>;
}

function RequireMinisterPortal({ children }: { children: ReactNode }) {
  if (isSystemAdmin()) return <Navigate to={homeRouteForRole()} replace />;
  return <>{children}</>;
}

export default function App() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(isAuthed());

  const clearSession = (redirectToLogin = true, notice?: string) => {
    if (notice) {
      setAuthNotice(notice);
    }
    logoutDummy();
    setAuthed(false);
    if (redirectToLogin) {
      navigate("/login", { replace: true });
    }
  };

  const login = () => {
    setAuthed(true);
    navigate(homeRouteForRole(), { replace: true });
  };

  const logout = () => {
    const accessToken = getAccessToken();
    if (accessToken) {
      void authApi.logout(accessToken).catch(() => undefined);
    }

    clearSession();
  };

  const goSettings = () => navigate("/settings");
  const goDashboard = () => navigate(homeRouteForRole());

  void authed;

  useEffect(() => {
    if (!authed) return;

    const handleSessionInvalid = (event: Event) => {
      const message =
        event instanceof CustomEvent &&
        typeof event.detail?.message === "string" &&
        event.detail.message.trim()
          ? event.detail.message
          : "Your session is no longer active. Please sign in again.";
      clearSession(true, message);
    };

    const validateSession = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      try {
        await authApi.me(accessToken);
      } catch {
        // requestJSON already dispatches the shared invalid-session event for 401s.
      }
    };

    const handleActivity = (event: Event) => {
      const inactiveFor = Date.now() - getLastActivityAt();
      if (inactiveFor >= SESSION_IDLE_TIMEOUT_MS) {
        if ("preventDefault" in event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        if ("stopPropagation" in event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        clearSession(
          true,
          "Your session timed out due to inactivity. Please sign in again.",
        );
        return;
      }

      touchLastActivity();
    };

    const checkIdleTimeout = () => {
      const inactiveFor = Date.now() - getLastActivityAt();
      if (inactiveFor >= SESSION_IDLE_TIMEOUT_MS) {
        clearSession(
          true,
          "Your session timed out due to inactivity. Please sign in again.",
        );
      }
    };

    window.addEventListener(
      SESSION_INVALID_EVENT,
      handleSessionInvalid as EventListener,
    );
    window.addEventListener("pointerdown", handleActivity, true);
    window.addEventListener("keydown", handleActivity, true);
    window.addEventListener("focusin", handleActivity, true);
    window.addEventListener("touchstart", handleActivity, true);
    void validateSession();
    const timer = window.setInterval(checkIdleTimeout, 15_000);

    return () => {
      window.removeEventListener(
        SESSION_INVALID_EVENT,
        handleSessionInvalid as EventListener,
      );
      window.removeEventListener("pointerdown", handleActivity, true);
      window.removeEventListener("keydown", handleActivity, true);
      window.removeEventListener("focusin", handleActivity, true);
      window.removeEventListener("touchstart", handleActivity, true);
      window.clearInterval(timer);
    };
  }, [authed]);

  return (
    <>
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage onLogin={login} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/reset-password"
          element={<PasswordTokenPage mode="reset" />}
        />
        <Route
          path="/setup-password"
          element={<PasswordTokenPage mode="setup" />}
        />

        <Route
          path="/minister"
          element={
            <RequireAuth>
              <RequireMinisterPortal>
                <MinisterDashboardPage
                  onOpenSettings={goSettings}
                  onLogout={logout}
                />
              </RequireMinisterPortal>
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireSystemAdmin>
                <AdminLayout currentPage="overview" onLogout={logout}>
                  <AdminOverviewPage />
                </AdminLayout>
              </RequireSystemAdmin>
            </RequireAuth>
          }
        />

        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <RequireSystemAdmin>
                <AdminLayout currentPage="users" onLogout={logout}>
                  <AdminUsersPage />
                </AdminLayout>
              </RequireSystemAdmin>
            </RequireAuth>
          }
        />

        <Route
          path="/admin/activity"
          element={
            <RequireAuth>
              <RequireSystemAdmin>
                <AdminLayout currentPage="activity" onLogout={logout}>
                  <AdminActivityPage />
                </AdminLayout>
              </RequireSystemAdmin>
            </RequireAuth>
          }
        />

        <Route
          path="/admin/system"
          element={
            <RequireAuth>
              <RequireSystemAdmin>
                <AdminLayout currentPage="system" onLogout={logout}>
                  <AdminSystemPage />
                </AdminLayout>
              </RequireSystemAdmin>
            </RequireAuth>
          }
        />

        <Route
          path="/admin/settings"
          element={
            <RequireAuth>
              <RequireSystemAdmin>
                <AdminLayout currentPage="settings" onLogout={logout}>
                  <SettingsPage onLogout={logout} />
                </AdminLayout>
              </RequireSystemAdmin>
            </RequireAuth>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAuth>
              {isSystemAdmin() ? (
                <Navigate to="/admin/settings" replace />
              ) : isMinister() ? (
                <MinisterLayout
                  onLogout={logout}
                  onOpenSettings={goSettings}
                  onGoDashboard={goDashboard}
                  currentPage="settings"
                >
                  <SettingsPage onLogout={logout} />
                </MinisterLayout>
              ) : (
                <div className="min-h-screen bg-background">
                  <SettingsPage onLogout={logout} />
                </div>
              )}
            </RequireAuth>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
