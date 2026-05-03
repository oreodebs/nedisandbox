import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CircleHelp,
  Database,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  systemApi,
  type SystemConfigurationEntry,
  type SystemHealthComponent,
} from "../../../app/api";
import { getAccessToken } from "../../../app/auth";

function HelpTooltip({
  text,
  align = "left",
}: {
  text: string;
  align?: "left" | "right";
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#98a2b3] transition hover:bg-[#f3f6fb] hover:text-[#475467]"
        aria-label="More information"
      >
        <CircleHelp className="h-4 w-4" />
      </button>

      <div
        className={[
          "pointer-events-none absolute top-full z-30 mt-2 hidden w-[260px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl group-hover:block",
          align === "right" ? "right-0" : "left-0",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}

function formatCheckedAt(value: string) {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: SystemHealthComponent["status"]) {
  switch (status) {
    case "healthy":
      return {
        badge: "bg-emerald-50 text-emerald-700",
        card: "bg-[#eef9ec] text-[#2f7a38]",
        label: "Healthy",
      };
    case "configured":
      return {
        badge: "bg-sky-50 text-sky-700",
        card: "bg-[#ecf7ff] text-[#1769aa]",
        label: "Configured",
      };
    case "warning":
      return {
        badge: "bg-amber-50 text-amber-700",
        card: "bg-[#fff7e8] text-[#b76a12]",
        label: "Attention",
      };
    default:
      return {
        badge: "bg-rose-50 text-rose-700",
        card: "bg-[#fff0f1] text-[#c93c4b]",
        label: "Error",
      };
  }
}

function iconForComponent(key: string) {
  if (key === "backend") return Server;
  if (key === "auth_db") return ShieldCheck;
  if (key === "clickhouse") return Database;
  return Mail;
}

function compactStatusCopy(component: SystemHealthComponent) {
  if (component.key === "backend") {
    return component.status === "healthy"
      ? "API online"
      : "API needs review";
  }

  if (component.key === "auth_db") {
    return component.status === "healthy"
      ? "Database online"
      : "Database needs review";
  }

  if (component.key === "clickhouse") {
    return component.status === "healthy"
      ? "Connection live"
      : "Connection failed";
  }

  return component.status === "configured"
    ? "SMTP ready"
    : component.status === "warning"
      ? "Development mode"
      : "Email check failed";
}

function componentSupportingCopy(component: SystemHealthComponent) {
  if (component.key === "backend") {
    return "FastAPI responded to the live health check.";
  }

  if (component.key === "auth_db") {
    return `Using ${component.meta.path?.split(/[\\/]/).pop() || "auth.db"}.`;
  }

  if (component.key === "clickhouse") {
    return component.status === "healthy"
      ? `Target database: ${component.meta.database || "Not configured"}.`
      : "Open the checks table below for the live connection detail.";
  }

  return component.status === "configured"
    ? `Sender: ${component.meta.sender || "Not configured"}.`
    : "Emails are currently staying in development mode.";
}

function SystemCard({ component }: { component: SystemHealthComponent }) {
  const Icon = iconForComponent(component.key);
  const tone = statusTone(component.status);

  return (
    <article className="rounded-[18px] border border-[#e4e9f1] bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#667085]">{component.label}</p>
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${tone.badge}`}
            >
              {tone.label}
            </span>
          </div>
        </div>

        <div
          className={`flex h-8 w-8 items-center justify-center rounded-2xl ${tone.card}`}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      <p className="mt-4 text-[18px] font-semibold text-[#101828]">
        {compactStatusCopy(component)}
      </p>
      <p className="mt-2 text-[13px] leading-6 text-[#475467]">
        {componentSupportingCopy(component)}
      </p>
    </article>
  );
}

export default function AdminSystemPage() {
  const accessToken = getAccessToken();
  const [components, setComponents] = useState<SystemHealthComponent[]>([]);
  const [configuration, setConfiguration] = useState<SystemConfigurationEntry[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissedWarning, setDismissedWarning] = useState(false);

  const loadSystemHealth = async () => {
    if (!accessToken) {
      setNotice("Sign in with the real backend system admin account to review system health.");
      return;
    }

    setLoading(true);
    try {
      const response = await systemApi.health(accessToken);
      setComponents(response.components);
      setConfiguration(response.configuration);
      setCheckedAt(response.checked_at);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "System health checks could not be loaded right now.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSystemHealth();
  }, [accessToken]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const checks = useMemo(
    () =>
      components.map((component) => ({
        ...component,
        tone: statusTone(component.status),
      })),
    [components],
  );

  const warningChecks = useMemo(
    () =>
      checks.filter(
        (component) =>
          component.status === "warning" || component.status === "error",
      ),
    [checks],
  );

  useEffect(() => {
    setDismissedWarning(false);
  }, [warningChecks.length, checkedAt]);

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

      {warningChecks.length > 0 && !dismissedWarning ? (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <CircleAlert className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[15px] font-semibold text-amber-900">
                  Attention needed
                </p>
                <p className="mt-1 text-[13px] leading-6 text-amber-800">
                  {warningChecks.length === 1
                    ? `${warningChecks[0].label} needs review right now. The checks table below carries the live backend result.`
                    : `${warningChecks.length} system checks need review right now. The checks table below carries the live backend result.`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDismissedWarning(true)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-700 transition hover:bg-black/5"
              aria-label="Dismiss attention message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-[#667085]">
                Runtime health
              </p>
              <HelpTooltip text="These checks come directly from the backend, auth database, ClickHouse connection, and email configuration state." />
            </div>
            <p className="mt-1 text-[12px] text-[#667085]">
              {checkedAt
                ? `Last checked ${formatCheckedAt(checkedAt)}`
                : "Run live checks against the services this admin experience depends on."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadSystemHealth()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[14px] bg-[#67c96d] px-4 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh checks
          </button>
        </div>
      </section>

      <section>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {checks.map((component) => (
            <SystemCard key={component.key} component={component} />
          ))}
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-[#667085]">System checks</p>
          <HelpTooltip text="Each row is a live result from the backend health endpoint. Nothing here is mocked." />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-[#eef2f6]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">
                <th className="pb-3 pr-4">Component</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Detail</th>
                <th className="pb-3">Checked at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f8]">
              {loading && checks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[13px] text-[#667085]">
                    Running system checks...
                  </td>
                </tr>
              ) : checks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[13px] text-[#667085]">
                    No system checks are available right now.
                  </td>
                </tr>
              ) : (
                checks.map((component) => (
                  <tr key={component.key}>
                    <td className="py-4 pr-4 align-middle">
                      <div className="font-medium text-[#101828]">{component.label}</div>
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${component.tone.badge}`}
                      >
                        {component.tone.label}
                      </span>
                    </td>
                    <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                      <div
                        className={
                          component.status === "error"
                            ? "rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700"
                            : component.status === "warning"
                              ? "rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"
                              : ""
                        }
                      >
                        {component.detail}
                      </div>
                    </td>
                    <td className="py-4 align-middle whitespace-nowrap text-[13px] text-[#475467]">
                      {formatCheckedAt(component.checked_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-[#667085]">
            Current configuration
          </p>
          <HelpTooltip
            align="right"
            text="This is a read-only view of safe runtime settings the backend is already using. It does not expose secrets."
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configuration.map((entry) => (
            <div
              key={entry.label}
              className="rounded-[18px] border border-[#eef2f6] bg-[#fcfdfd] px-4 py-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">
                {entry.label}
              </p>
              <p className="mt-2 break-words text-[14px] font-medium leading-6 text-[#101828]">
                {entry.value}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
