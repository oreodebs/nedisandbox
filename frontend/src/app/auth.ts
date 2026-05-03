export type Role = "SYSTEM_ADMIN" | "MINISTER" | "STATE_ADMIN";
const AUTH_NOTICE_KEY = "nedi_auth_notice";
const LAST_ACTIVITY_KEY = "nedi_last_activity_at";

type LoginSessionPayload = {
  role: Role;
  email: string;
  name?: string;
  firstName?: string | null;
  lastName?: string | null;
  accessToken?: string | null;
  assignedState?: string | null;
};

export function buildDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = "User"
) {
  const displayName = [firstName?.trim(), lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  return displayName || fallback;
}

export function normalizeRole(role: string | null | undefined): Role {
  const normalized = (role || "").trim().toUpperCase();

  if (normalized === "SYSTEM_ADMIN" || normalized === "ADMIN") {
    return "SYSTEM_ADMIN";
  }

  if (normalized === "STATE_ADMIN") {
    return "STATE_ADMIN";
  }

  return "MINISTER";
}

export function loginWithSession({
  role,
  email,
  name,
  firstName,
  lastName,
  accessToken,
  assignedState,
}: LoginSessionPayload) {
  const displayName = name || buildDisplayName(firstName, lastName);
  localStorage.setItem("nedi_authed", "true");
  localStorage.setItem("user_name", displayName);
  localStorage.setItem("user_email", email);
  localStorage.setItem("user_role", role);
  if (firstName) {
    localStorage.setItem("user_first_name", firstName);
  } else {
    localStorage.removeItem("user_first_name");
  }
  if (lastName) {
    localStorage.setItem("user_last_name", lastName);
  } else {
    localStorage.removeItem("user_last_name");
  }
  if (assignedState) {
    localStorage.setItem("user_assigned_state", assignedState);
  } else {
    localStorage.removeItem("user_assigned_state");
  }

  if (accessToken) {
    localStorage.setItem("nedi_access_token", accessToken);
  } else {
    localStorage.removeItem("nedi_access_token");
  }

  localStorage.setItem("nedi_role", role);
  localStorage.setItem(
    "nedi_user",
    JSON.stringify({
      name: displayName,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      email,
      role,
      assignedState: assignedState ?? null,
    }),
  );
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  sessionStorage.removeItem(AUTH_NOTICE_KEY);
}

export function logoutDummy() {
  localStorage.removeItem("nedi_authed");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_first_name");
  localStorage.removeItem("user_last_name");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_role");
  localStorage.removeItem("user_assigned_state");
  localStorage.removeItem("nedi_access_token");
  localStorage.removeItem("nedi_role");
  localStorage.removeItem("nedi_user");
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function setAuthNotice(message: string) {
  sessionStorage.setItem(AUTH_NOTICE_KEY, message);
}

export function consumeAuthNotice(): string | null {
  const notice = sessionStorage.getItem(AUTH_NOTICE_KEY);
  if (notice) {
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
  }
  return notice;
}

export function getLastActivityAt(): number {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

export function touchLastActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function isAuthed(): boolean {
  return (
    localStorage.getItem("nedi_authed") === "true" &&
    Boolean(localStorage.getItem("nedi_access_token"))
  );
}

export function getAccessToken(): string | null {
  return localStorage.getItem("nedi_access_token");
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

export function getAssignedState(): string | null {
  const direct = localStorage.getItem("user_assigned_state");
  if (direct) return direct;

  try {
    const raw = localStorage.getItem("nedi_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.assignedState === "string"
      ? parsed.assignedState
      : null;
  } catch {
    return null;
  }
}

export function isMinister(): boolean {
  return getRole() === "MINISTER";
}

export function isSystemAdmin(): boolean {
  return getRole() === "SYSTEM_ADMIN";
}

export function isStateAdmin(): boolean {
  return getRole() === "STATE_ADMIN";
}

export function homeRouteForRole(): string {
  switch (getRole()) {
    case "SYSTEM_ADMIN":
      return "/admin";
    case "MINISTER":
    case "STATE_ADMIN":
      return "/minister";
    default:
      return "/minister";
  }
}
