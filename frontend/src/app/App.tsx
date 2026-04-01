// src/app/App.tsx
import { useState, useEffect, type ReactNode } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

import LoginPage from "../pages/LoginPage";
import MinisterDashboardPage from "../modules/minister/pages/MinisterDashboardPage";
import SettingsPage from "../pages/SettingsPage";
import MinisterLayout from "../layouts/MinisterLayout";
import { isAuthed, isMinister, logoutDummy, homeRouteForRole } from "./auth";

// ─────────────────────────────────────────────────────────────
// Scroll to top on every route change
// ─────────────────────────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // "auto" = instant jump (valid). Use "smooth" if you want animation.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

// ─────────────────────────────────────────────────────────────
// Route guard
// ─────────────────────────────────────────────────────────────
function RequireAuth({ children }: { children: ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────
// After login, send user to the right dashboard for their role
// ─────────────────────────────────────────────────────────────
function HomeRedirect() {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <Navigate to={homeRouteForRole()} replace />;
}

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();

  // Kept as a single boolean so RequireAuth re-evaluates after login/logout.
  // When you move to a real auth context, remove this and use context instead.
  const [authed, setAuthed] = useState(isAuthed());

  const login = () => {
    // LoginPage has already called loginDummy() — nothing to write here.
    // Just sync React state so RequireAuth re-renders, then redirect.
    setAuthed(true);
    navigate(homeRouteForRole(), { replace: true });
  };

  const logout = () => {
    logoutDummy(); // single source — clears all keys
    setAuthed(false);
    navigate("/login", { replace: true });
  };

  const goSettings = () => navigate("/settings");
  const goDashboard = () => navigate(homeRouteForRole());

  // Keep TS happy — authed is read by RequireAuth via isAuthed(), but the
  // state value triggers re-renders of the tree when it flips.
  void authed;

  return (
    <>
      {/* ✅ Must be OUTSIDE <Routes> */}
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<HomeRedirect />} />

        <Route path="/login" element={<LoginPage onLogin={login} />} />

        {/* ── Minister ── */}
        <Route
          path="/minister"
          element={
            <RequireAuth>
              <MinisterDashboardPage
                onOpenSettings={goSettings}
                onLogout={logout}
              />
            </RequireAuth>
          }
        />

        {/* ── Settings ── */}
        <Route
          path="/settings"
          element={
            <RequireAuth>
              {isMinister() ? (
                <MinisterLayout
                  onLogout={logout}
                  onOpenSettings={goSettings}
                  onGoDashboard={goDashboard}
                  currentPage="settings"
                >
                  <SettingsPage onBack={goDashboard} onLogout={logout} />
                </MinisterLayout>
              ) : (
                <div className="min-h-screen bg-background">
                  <SettingsPage onBack={goDashboard} onLogout={logout} />
                </div>
              )}
            </RequireAuth>
          }
        />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}