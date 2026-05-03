import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  Database,
  Mail,
  Server,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  auditApi,
  systemApi,
  usersApi,
  type AuditEvent,
  type AuthUser,
  type SystemHealthComponent,
} from "../../../app/api";
import { getAccessToken } from "../../../app/auth";

type SummaryCard = {
  label: string;
  value: string;
  note: string;
  to: string;
  icon: LucideIcon;
  tone: "indigo" | "emerald" | "amber" | "rose";
};

type DailyLoginPoint = {
  key: string;
  label: string;
  value: number;
};

const ROLE_STYLES: Array<{
  role: AuthUser["role"];
  label: string;
  color: string;
}> = [
  { role: "SYSTEM_ADMIN", label: "System Admin", color: "#335CFF" },
  { role: "MINISTER", label: "Minister", color: "#1FA971" },
  { role: "STATE_ADMIN", label: "State Admin", color: "#D18A1B" },
];

const TONE_STYLES = {
  indigo: {
    icon: "bg-[#eef2ff] text-[#3855d6]",
  },
  emerald: {
    icon: "bg-[#eef9ec] text-[#2f9a4a]",
  },
  amber: {
    icon: "bg-[#fff7e8] text-[#c77d17]",
  },
  rose: {
    icon: "bg-[#fff0f1] text-[#c93c4b]",
  },
} as const;

function formatCount(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCheckedAt(value: string) {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRole(role: AuthUser["role"] | null) {
  if (role === "SYSTEM_ADMIN") return "System Admin";
  if (role === "STATE_ADMIN") return "State Admin";
  if (role === "MINISTER") return "Minister";
  return "User";
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSevenDays() {
  const today = new Date();
  const points: DailyLoginPoint[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - offset);
    points.push({
      key: toDayKey(date),
      label: date.toLocaleDateString("en-NG", { weekday: "short" }),
      value: 0,
    });
  }

  return points;
}

function buildLoginSeries(securityEvents: AuditEvent[]) {
  const buckets = buildSevenDays();
  const lookup = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  securityEvents
    .filter((event) => event.event === "Login successful")
    .forEach((event) => {
      const key = toDayKey(new Date(event.created_at));
      const bucket = lookup.get(key);
      if (bucket) bucket.value += 1;
    });

  return buckets;
}

function buildLineChart(values: number[]) {
  const width = 760;
  const height = 240;
  const paddingX = 18;
  const paddingY = 20;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const max = Math.max(...values, 1);

  const points = values.map((value, index) => {
    const x = paddingX + (usableWidth * index) / Math.max(values.length - 1, 1);
    const y = height - paddingY - (value / max) * usableHeight;
    return { x, y, value };
  });

  const line = points
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const area = `${line} L ${lastPoint.x.toFixed(2)} ${(height - paddingY).toFixed(2)} L ${firstPoint.x.toFixed(2)} ${(height - paddingY).toFixed(2)} Z`;

  return { width, height, points, line, area };
}

function statusTone(status: SystemHealthComponent["status"]) {
  switch (status) {
    case "healthy":
      return "bg-emerald-50 text-emerald-700";
    case "configured":
      return "bg-sky-50 text-sky-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-rose-50 text-rose-700";
  }
}

function statusLabel(status: SystemHealthComponent["status"]) {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "configured":
      return "Configured";
    case "warning":
      return "Attention";
    default:
      return "Error";
  }
}

function componentIcon(key: string) {
  if (key === "backend") return Server;
  if (key === "auth_db") return ShieldCheck;
  if (key === "clickhouse") return Database;
  return Mail;
}

function SummaryCardItem({ card }: { card: SummaryCard }) {
  const Icon = card.icon;
  const styles = TONE_STYLES[card.tone];

  return (
    <Link
      to={card.to}
      className="group rounded-[18px] border border-[#e4e9f1] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#667085]">{card.label}</p>
          <div className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] text-[#101828]">
            {card.value}
          </div>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] leading-5 text-[#667085]">{card.note}</p>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#98a2b3] transition group-hover:translate-x-0.5 group-hover:text-[#475467]" />
      </div>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const accessToken = getAccessToken();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [activityEvents, setActivityEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<AuditEvent[]>([]);
  const [systemChecks, setSystemChecks] = useState<SystemHealthComponent[]>([]);
  const [systemCheckedAt, setSystemCheckedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissedAlert, setDismissedAlert] = useState(false);

  const loadOverviewCore = async () => {
    if (!accessToken) {
      setNotice(
        "Sign in with the real backend system admin account to load the live overview.",
      );
      return;
    }

    try {
      const [usersResult, activityResult, securityResult] = await Promise.all([
        usersApi.list(accessToken),
        auditApi.list(accessToken, "ACTIVITY"),
        auditApi.list(accessToken, "SECURITY"),
      ]);

      setUsers(usersResult);
      setActivityEvents(activityResult);
      setSecurityEvents(securityResult);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Overview could not be loaded right now.",
      );
    }
  };

  const loadOverviewSystem = async () => {
    if (!accessToken) {
      return;
    }

    try {
      const result = await systemApi.health(accessToken);
      setSystemChecks(result.components);
      setSystemCheckedAt(result.checked_at);
    } catch {
      setSystemChecks([]);
      setSystemCheckedAt(null);
    }
  };

  useEffect(() => {
    void loadOverviewCore();
    void loadOverviewSystem();
  }, [accessToken]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pendingSetups = useMemo(
    () => users.filter((user) => user.is_active && user.must_change_password).length,
    [users],
  );

  const failedLoginsToday = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    return securityEvents.filter((event) => {
      const createdAt = new Date(event.created_at).getTime();
      return (
        now - createdAt <= oneDay &&
        (event.event === "Login failed" || event.event === "Login blocked")
      );
    }).length;
  }, [securityEvents]);

  const summaryCards = useMemo<SummaryCard[]>(
    () => [
      {
        label: "Total Users",
        value: formatCount(users.length),
        note: "All registered platform accounts",
        to: "/admin/users",
        icon: Users,
        tone: "indigo",
      },
      {
        label: "Active Accounts",
        value: formatCount(users.filter((user) => user.is_active).length),
        note: "Currently enabled accounts",
        to: "/admin/users",
        icon: UserCheck,
        tone: "emerald",
      },
      {
        label: "Pending Setups",
        value: formatCount(pendingSetups),
        note: "Users still waiting to set a password",
        to: "/admin/users",
        icon: Clock3,
        tone: "amber",
      },
      {
        label: "Login Alerts",
        value: formatCount(failedLoginsToday),
        note: "Failed or blocked logins in the last 24 hours",
        to: "/admin/activity",
        icon: ShieldAlert,
        tone: "rose",
      },
    ],
    [failedLoginsToday, pendingSetups, users],
  );

  const loginSeries = useMemo(() => buildLoginSeries(securityEvents), [securityEvents]);
  const loginChart = useMemo(
    () => buildLineChart(loginSeries.map((item) => item.value)),
    [loginSeries],
  );

  const loginWeekTotal = useMemo(
    () => loginSeries.reduce((sum, point) => sum + point.value, 0),
    [loginSeries],
  );

  const peakLoginDay = useMemo(
    () =>
      loginSeries.reduce((highest, point) =>
        point.value > highest.value ? point : highest,
      ),
    [loginSeries],
  );

  const recentActivity = useMemo(
    () =>
      [...activityEvents]
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime(),
        )
        .slice(0, 6),
    [activityEvents],
  );

  const roleDistribution = useMemo(() => {
    const items = ROLE_STYLES.map((item) => {
      const value = users.filter((user) => user.role === item.role).length;
      return { ...item, value };
    });

    const total = items.reduce((sum, item) => sum + item.value, 0);
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    const segments = items.map((item) => {
      const ratio = total > 0 ? item.value / total : 0;
      const dash = ratio * circumference;
      const segment = {
        ...item,
        dash,
        offset,
        percentage: total > 0 ? Math.round(ratio * 100) : 0,
      };
      offset += dash;
      return segment;
    });

    return { total, circumference, segments };
  }, [users]);

  const systemIssues = useMemo(
    () =>
      systemChecks.filter(
        (component) =>
          component.status === "warning" || component.status === "error",
      ),
    [systemChecks],
  );

  useEffect(() => {
    setDismissedAlert(false);
  }, [systemIssues.length, systemCheckedAt]);

  return (
    <div className="space-y-5">
      {notice ? (
        <div className="fixed bottom-6 right-6 z-[140] w-[min(360px,calc(100vw-2rem))] rounded-[18px] border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-800 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="font-medium">{notice}</div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {systemIssues.length > 0 && !dismissedAlert ? (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[15px] font-semibold text-amber-900">
                  Attention needed
                </p>
                <p className="mt-1 text-[13px] leading-6 text-amber-800">
                  {systemIssues.length === 1
                    ? `${systemIssues[0].label} needs review right now. Open the system page to see the live check detail.`
                    : `${systemIssues.length} service checks need review right now. Open the system page to see the live check detail.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/admin/system"
                className="inline-flex items-center gap-2 rounded-[12px] bg-white px-3 py-2 text-[13px] font-medium text-[#101828] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:bg-[#f8fafc]"
              >
                Open system
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => setDismissedAlert(true)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-amber-700 transition hover:bg-black/5"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-x-auto pb-1">
        <div className="grid min-w-[980px] grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <SummaryCardItem key={card.label} card={card} />
          ))}
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-[#667085]">
              Login Activity
            </p>
            <p className="mt-1 text-[12px] text-[#667085]">
              Successful sign-ins captured across the last 7 days
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-full bg-[#eef2ff] px-3 py-1.5 text-[12px] font-medium text-[#335CFF]">
              Week total: {formatCount(loginWeekTotal)}
            </div>
            <div className="rounded-full bg-[#f4f7fb] px-3 py-1.5 text-[12px] font-medium text-[#475467]">
              Peak day: {peakLoginDay.label}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[18px] border border-[#eef2f6] bg-[#fbfcfe] px-4 pb-4 pt-5">
          {loginWeekTotal === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-[13px] text-[#667085]">
              No successful logins have been recorded in the last 7 days yet.
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${loginChart.width} ${loginChart.height}`}
              className="h-[220px] w-full"
              preserveAspectRatio="none"
            >
              {[0.25, 0.5, 0.75].map((fraction) => {
                const y =
                  loginChart.height - 20 - (loginChart.height - 40) * fraction;
                return (
                  <line
                    key={fraction}
                    x1="0"
                    x2={loginChart.width}
                    y1={y}
                    y2={y}
                    stroke="#e7edf5"
                    strokeDasharray="5 6"
                  />
                );
              })}

              <path d={loginChart.area} fill="url(#overviewLoginFill)" />
              <path
                d={loginChart.line}
                fill="none"
                stroke="#274BDB"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {loginChart.points.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}`}
                  cx={point.x}
                  cy={point.y}
                  r="4.2"
                  fill="#ffffff"
                  stroke="#274BDB"
                  strokeWidth="2.6"
                >
                  <title>{`${loginSeries[index].label}: ${point.value} successful logins`}</title>
                </circle>
              ))}

              <defs>
                <linearGradient id="overviewLoginFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6582FF" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#6582FF" stopOpacity="0.02" />
                </linearGradient>
              </defs>
            </svg>
          )}

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-[#98a2b3]">
            {loginSeries.map((point) => (
              <div key={point.key} className="rounded-md px-1 py-1">
                {point.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <article className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-[#667085]">
                Recent Activity
              </p>
              <p className="mt-1 text-[12px] text-[#667085]">
                Latest administrative actions captured in the activity log
              </p>
            </div>

            <Link
              to="/admin/activity"
              className="inline-flex items-center gap-2 rounded-full bg-[#f4f7fb] px-3 py-1.5 text-[12px] font-medium text-[#475467] transition hover:bg-[#ecf1f7]"
            >
              Open audit logs
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-[#eef2f6]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f8]">
                {recentActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-[13px] text-[#667085]"
                    >
                      No activity has been captured yet.
                    </td>
                  </tr>
                ) : (
                  recentActivity.map((event) => (
                    <tr key={event.id}>
                      <td className="py-4 pr-4 align-middle text-[13px] font-medium text-[#101828]">
                        {event.user_name}
                      </td>
                      <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                        {formatRole(event.user_role)}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <span className="inline-flex rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-medium text-[#335CFF]">
                          {event.category}
                        </span>
                      </td>
                      <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                        {event.event}
                      </td>
                      <td className="py-4 align-middle whitespace-nowrap text-[13px] text-[#475467]">
                        {formatDateTime(event.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="overflow-x-auto pb-1">
        <div className="grid min-w-[760px] grid-cols-2 gap-4">
          <article className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-[#667085]">
                Role Distribution
              </p>
              <p className="mt-1 text-[12px] text-[#667085]">
                Current spread of access roles across the platform
              </p>
            </div>

            <Link
              to="/admin/users"
              className="inline-flex items-center gap-2 rounded-full bg-[#f4f7fb] px-3 py-1.5 text-[12px] font-medium text-[#475467] transition hover:bg-[#ecf1f7]"
            >
              Open users
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 flex flex-col items-center gap-6">
            <div className="relative flex h-[170px] w-[170px] items-center justify-center">
              <svg viewBox="0 0 160 160" className="h-[170px] w-[170px] -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="62"
                  fill="none"
                  stroke="#eef2f6"
                  strokeWidth="16"
                />
                {roleDistribution.segments.map((segment) => (
                  <circle
                    key={segment.role}
                    cx="80"
                    cy="80"
                    r="62"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="16"
                    strokeLinecap="butt"
                    strokeDasharray={`${segment.dash} ${roleDistribution.circumference - segment.dash}`}
                    strokeDashoffset={-segment.offset}
                  />
                ))}
              </svg>

              <div className="absolute text-center">
                <div className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-[#101828]">
                  {formatCount(roleDistribution.total)}
                </div>
                <div className="mt-1 text-[12px] text-[#667085]">Users</div>
              </div>
            </div>

            <div className="w-full space-y-3">
              {roleDistribution.segments.map((segment) => (
                <div
                  key={segment.role}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-[#eef2f6] bg-[#fbfcfe] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="text-[13px] font-medium text-[#344054]">
                      {segment.label}
                    </span>
                  </div>

                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-[#101828]">
                      {formatCount(segment.value)}
                    </div>
                    <div className="text-[11px] text-[#98a2b3]">
                      {segment.percentage}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </article>

          <article className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-[#667085]">
                Database & Services
              </p>
              <p className="mt-1 text-[12px] text-[#667085]">
                Live status from the backend runtime checks
              </p>
            </div>

            <Link
              to="/admin/system"
              className="inline-flex items-center gap-2 rounded-full bg-[#f4f7fb] px-3 py-1.5 text-[12px] font-medium text-[#475467] transition hover:bg-[#ecf1f7]"
            >
              Open system
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {systemChecks.length === 0 ? (
              <div className="rounded-[14px] border border-[#eef2f6] bg-[#fbfcfe] px-4 py-5 text-[13px] text-[#667085]">
                Loading live service checks...
              </div>
            ) : (
              systemChecks.map((component) => {
                const Icon = componentIcon(component.key);

                return (
                  <div
                    key={component.key}
                    className="rounded-[14px] border border-[#eef2f6] bg-[#fbfcfe] px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-[#516074] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        <Icon className="h-4.5 w-4.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[13px] font-medium text-[#101828]">
                            {component.label}
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(component.status)}`}
                          >
                            {statusLabel(component.status)}
                          </span>
                        </div>

                        <p className="mt-1 text-[12px] leading-5 text-[#667085]">
                          {component.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {systemCheckedAt ? (
            <div className="mt-4 text-[11px] text-[#98a2b3]">
              Last checked {formatCheckedAt(systemCheckedAt)}
            </div>
          ) : null}
          </article>
        </div>
      </section>
    </div>
  );
}
