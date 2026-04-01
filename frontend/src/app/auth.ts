// src/app/auth.ts
// ─────────────────────────────────────────────────────────────
// Single source of truth for auth state and role detection.
// ALL login/logout operations must go through loginDummy / logoutDummy.
// No other file should write auth keys to localStorage directly.
// ─────────────────────────────────────────────────────────────

export type Role = "MINISTER" | "EXECUTIVE" | "IT_SUPPORT" | "PUBLIC";

/**
 * Dummy login — stores all session keys in one place.
 * Replace the body of this function when the real backend is ready.
 * Every caller (LoginPage, tests, etc.) just calls this — never writes
 * to localStorage themselves.
 */
export function loginDummy(role: Role, name: string, email: string) {
  localStorage.setItem("nedi_authed", "true");
  localStorage.setItem("user_name", name);
  localStorage.setItem("user_email", email);
  localStorage.setItem("user_role", role);
  // Keep legacy keys so any older references don't silently break
  localStorage.setItem("nedi_role", role);
  localStorage.setItem("nedi_user", JSON.stringify({ name, email, role }));
}

/**
 * Clears every session key set by loginDummy.
 * All logout paths must call this — nothing else.
 */
export function logoutDummy() {
  localStorage.removeItem("nedi_authed");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_role");
  localStorage.removeItem("nedi_role");
  localStorage.removeItem("nedi_user");
}

export function isAuthed(): boolean {
  return localStorage.getItem("nedi_authed") === "true";
}

export function getRole(): Role | null {
  const direct = (localStorage.getItem("user_role") ||
    localStorage.getItem("nedi_role")) as Role | null;
  if (direct) return direct;

  try {
    const raw = localStorage.getItem("nedi_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed?.role as Role) ?? null;
  } catch {
    return null;
  }
}

// ─── Role helpers ────────────────────────────────────────────
// Add one helper per role so callers never hardcode the string.
export function isMinister():  boolean { return getRole() === "MINISTER"; }
export function isExecutive():  boolean { return getRole() === "EXECUTIVE"; }
export function isITSupport():  boolean { return getRole() === "IT_SUPPORT"; }
export function isPublic():     boolean { return getRole() === "PUBLIC"; }

/**
 * Returns the home route for the current user's role.
 * Use this in App.tsx redirects instead of scattered if/else blocks.
 */
export function homeRouteForRole(): string {
  switch (getRole()) {
    case "MINISTER":   return "/minister";
    case "EXECUTIVE":  return "/executive";   // add route when ready
    case "IT_SUPPORT": return "/it-support";  // add route when ready
    default:           return "/minister";    // fallback until other dashboards exist
  }
}
