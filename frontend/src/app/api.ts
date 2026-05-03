type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
export const SESSION_INVALID_EVENT = "nedi:session-invalid";

type RequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
};

function inferApiBase(): string {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  const { hostname, origin, protocol } = window.location;
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";

  if (isLocalhost) {
    return `${protocol}//${hostname}:8000`;
  }

  // In deployed environments, prefer same-origin API routing unless an
  // explicit backend URL is configured.
  return origin.replace(/\/+$/, "");
}

const API_BASE = inferApiBase();

async function requestJSON<T>(
  path: string,
  { method = "GET", body, headers = {} }: RequestOptions = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const requestHeaders = new Headers(headers);

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const responseType = response.headers.get("content-type") || "";
    const isAuthorizedRequest = requestHeaders.has("Authorization");
    let detail = `${response.status} ${response.statusText}`;

    if (responseType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      detail =
        typeof payload?.detail === "string"
          ? payload.detail
          : payload?.message || detail;
    } else {
      const text = await response.text().catch(() => "");
      detail = text || detail;
    }

    if (response.status === 401 && isAuthorizedRequest) {
      window.dispatchEvent(
        new CustomEvent(SESSION_INVALID_EVENT, {
          detail: { message: detail },
        }),
      );
    }

    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "SYSTEM_ADMIN" | "MINISTER" | "STATE_ADMIN";
  assigned_state: string | null;
  is_active: boolean;
  is_admin: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CreateUserRequest = {
  email: string;
  first_name: string;
  last_name: string;
  role: AuthUser["role"];
  assigned_state: string | null;
};

export type AuditEvent = {
  id: number;
  stream: "ACTIVITY" | "SECURITY";
  category: string;
  event: string;
  user_name: string;
  user_role: AuthUser["role"] | null;
  created_at: string;
};

export type SystemHealthComponent = {
  key: string;
  label: string;
  status: "healthy" | "configured" | "warning" | "error" | string;
  detail: string;
  checked_at: string;
  meta: Record<string, string>;
};

export type SystemConfigurationEntry = {
  label: string;
  value: string;
};

export type SystemHealthResponse = {
  checked_at: string;
  components: SystemHealthComponent[];
  configuration: SystemConfigurationEntry[];
};

type MessageResponse = {
  message: string;
};

type AuthResponse = {
  message: string;
  user: AuthUser;
};

type LoginResponse = AuthResponse & {
  access_token: string;
  token_type: string;
};

type CreateUserResponse = {
  message: string;
  user: AuthUser;
  setup_url: string;
};

export const authApi = {
  login: (email: string, password: string) =>
    requestJSON<LoginResponse>(`/api/v1/auth/login`, {
      method: "POST",
      body: { email, password },
    }),

  logout: (accessToken: string) =>
    requestJSON<MessageResponse>(`/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  changePassword: (
    accessToken: string,
    currentPassword: string,
    newPassword: string
  ) =>
    requestJSON<AuthResponse>(`/api/v1/auth/change-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        current_password: currentPassword,
        new_password: newPassword,
      },
    }),

  forgotPassword: (email: string) =>
    requestJSON<MessageResponse>(`/api/v1/auth/forgot-password`, {
      method: "POST",
      body: { email },
    }),

  resetPassword: (token: string, newPassword: string) =>
    requestJSON<AuthResponse>(`/api/v1/auth/reset-password`, {
      method: "POST",
      body: { token, new_password: newPassword },
    }),

  setupPassword: (token: string, newPassword: string) =>
    requestJSON<AuthResponse>(`/api/v1/auth/setup-password`, {
      method: "POST",
      body: { token, new_password: newPassword },
    }),

  me: (accessToken: string) =>
    requestJSON<AuthUser>(`/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};

export const usersApi = {
  list: (accessToken: string) =>
    requestJSON<AuthUser[]>(`/api/v1/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  create: (accessToken: string, payload: CreateUserRequest) =>
    requestJSON<CreateUserResponse>(`/api/v1/users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: payload,
    }),

  update: (accessToken: string, userId: number, payload: CreateUserRequest) =>
    requestJSON<AuthResponse>(`/api/v1/users/${userId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: payload,
    }),

  updateStatus: (accessToken: string, userId: number, isActive: boolean) =>
    requestJSON<AuthResponse>(`/api/v1/users/${userId}/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { is_active: isActive },
    }),

  resendSetup: (accessToken: string, userId: number) =>
    requestJSON<CreateUserResponse>(`/api/v1/users/${userId}/resend-setup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  delete: (accessToken: string, userId: number) =>
    requestJSON<MessageResponse>(`/api/v1/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};

export const auditApi = {
  list: (accessToken: string, stream: AuditEvent["stream"]) =>
    requestJSON<AuditEvent[]>(
      `/api/v1/audit?stream=${encodeURIComponent(stream)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    ),
};

export const systemApi = {
  health: (accessToken: string) =>
    requestJSON<SystemHealthResponse>(`/api/v1/system/health`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};
