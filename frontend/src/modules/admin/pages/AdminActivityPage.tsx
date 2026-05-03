import { useEffect, useMemo, useState } from "react";
import {
  CircleHelp,
  Download,
  KeyRound,
  Search,
  ShieldAlert,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { auditApi, type AuditEvent } from "../../../app/api";
import { getAccessToken } from "../../../app/auth";

type ActivityTab = "ACTIVITY" | "SECURITY";
const ACTIVITY_CATEGORY_META: Record<
  string,
  { label: string; tone: string }
> = {
  "User Management": {
    label: "User Management",
    tone: "bg-emerald-50 text-emerald-700",
  },
  "Role Change": {
    label: "Role Change",
    tone: "bg-violet-50 text-violet-700",
  },
  Invite: {
    label: "Invite",
    tone: "bg-amber-50 text-amber-700",
  },
};

const SECURITY_CATEGORY_META: Record<
  string,
  { label: string; tone: string }
> = {
  Authentication: {
    label: "Authentication",
    tone: "bg-rose-50 text-rose-700",
  },
  Session: {
    label: "Session",
    tone: "bg-emerald-50 text-emerald-700",
  },
  Password: {
    label: "Password",
    tone: "bg-violet-50 text-violet-700",
  },
  Token: {
    label: "Token",
    tone: "bg-sky-50 text-sky-700",
  },
};

function formatAuditTimestamp(timestamp: string | null) {
  if (!timestamp) return "Recently";

  return new Date(timestamp).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
          "pointer-events-none absolute top-full z-30 mt-2 hidden w-[250px] rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-white shadow-2xl group-hover:block",
          align === "right" ? "right-0" : "left-0",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}

function formatRole(role: AuditEvent["user_role"]) {
  if (!role) return "—";

  if (role === "SYSTEM_ADMIN") return "System Admin";
  if (role === "STATE_ADMIN") return "State Admin";
  return "Minister";
}

function displayRole(role: AuditEvent["user_role"]) {
  if (!role) return "-";
  if (role === "SYSTEM_ADMIN") return "System Admin";
  if (role === "STATE_ADMIN") return "State Admin";
  return "Minister";
}

void formatRole;

function StatTile({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-[16px] border border-[#e4e9f1] bg-white px-4 py-3 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[#667085]">{label}</p>
          <div className="mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.03em] text-[#101828]">
            {value}
          </div>
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#eef9ec] text-[#4ea84c]">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="mt-2 text-[11px] leading-5 text-[#667085]">{note}</div>
    </article>
  );
}

export default function AdminActivityPage() {
  const accessToken = getAccessToken();
  const pageSize = 10;
  const [activeTab, setActiveTab] = useState<ActivityTab>("ACTIVITY");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [securityCategoryFilter, setSecurityCategoryFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AuditEvent[]>([]);
  const [securityLogs, setSecurityLogs] = useState<AuditEvent[]>([]);

  const loadAuditLogs = async () => {
    if (!accessToken) {
      setNotice("Sign in with the real backend system admin account to review audit logs.");
      return;
    }

    setLoadingLogs(true);
    try {
      const [activity, security] = await Promise.all([
        auditApi.list(accessToken, "ACTIVITY"),
        auditApi.list(accessToken, "SECURITY"),
      ]);
      setActivityLogs(activity);
      setSecurityLogs(security);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Audit logs could not be loaded right now.",
      );
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadAuditLogs();
  }, [accessToken]);

  const activityTotals = useMemo(
    () => ({
      total: activityLogs.length,
      users: activityLogs.filter((item) => item.category === "User Management")
        .length,
      roles: activityLogs.filter((item) => item.category === "Role Change").length,
      invites: activityLogs.filter((item) => item.category === "Invite").length,
    }),
    [activityLogs],
  );

  const securityTotals = useMemo(
    () => ({
      authentication: securityLogs.filter(
        (item) => item.category === "Authentication",
      ).length,
      sessions: securityLogs.filter((item) => item.category === "Session").length,
      password: securityLogs.filter((item) => item.category === "Password").length,
      token: securityLogs.filter((item) => item.category === "Token").length,
    }),
    [securityLogs],
  );

  const filteredActivityLogs = useMemo(() => {
    return activityLogs.filter((item) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        needle === "" ||
        item.user_name.toLowerCase().includes(needle) ||
        displayRole(item.user_role).toLowerCase().includes(needle) ||
        item.event.toLowerCase().includes(needle);

      const matchesCategory = categoryFilter === "ALL" || item.category === categoryFilter;

      const itemDate = item.created_at.slice(0, 10);
      const matchesDate = !dateFilter || itemDate === dateFilter;

      return matchesQuery && matchesCategory && matchesDate;
    });
  }, [activityLogs, categoryFilter, dateFilter, query]);

  const filteredSecurityLogs = useMemo(() => {
    return securityLogs.filter((item) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        needle === "" ||
        item.user_name.toLowerCase().includes(needle) ||
        displayRole(item.user_role).toLowerCase().includes(needle) ||
        item.event.toLowerCase().includes(needle);

      const matchesCategory =
        securityCategoryFilter === "ALL" ||
        item.category === securityCategoryFilter;

      const itemDate = item.created_at.slice(0, 10);
      const matchesDate = !dateFilter || itemDate === dateFilter;

      return matchesQuery && matchesCategory && matchesDate;
    });
  }, [dateFilter, query, securityCategoryFilter, securityLogs]);

  const filteredLogs =
    activeTab === "ACTIVITY" ? filteredActivityLogs : filteredSecurityLogs;

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const pagedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [currentPage, filteredLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, query, categoryFilter, securityCategoryFilter, dateFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(null), 8500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleDownloadLog = () => {
    const rows =
      activeTab === "ACTIVITY"
        ? filteredActivityLogs.map((item) => [
            item.user_name,
            displayRole(item.user_role),
            (ACTIVITY_CATEGORY_META[item.category] || { label: item.category }).label,
            item.event,
            formatAuditTimestamp(item.created_at),
          ])
        : filteredSecurityLogs.map((item) => [
            item.user_name,
            displayRole(item.user_role),
            (SECURITY_CATEGORY_META[item.category] || { label: item.category }).label,
            item.event,
            formatAuditTimestamp(item.created_at),
          ]);

    const header = ["User", "Role", "Category", "Event", "Timestamp"];

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      activeTab === "ACTIVITY"
        ? `nedi-audit-log-${new Date().toISOString().slice(0, 10)}.csv`
        : `nedi-security-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      activeTab === "ACTIVITY"
        ? "Audit log downloaded successfully."
        : "Security log downloaded successfully.",
    );
  };

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

      <section className="overflow-x-auto pb-1">
        <div className="grid min-w-[920px] grid-cols-4 gap-4">
          {activeTab === "ACTIVITY" ? (
            <>
              <StatTile
                label="Total Events"
                value={String(activityTotals.total)}
                note="All tracked admin-side activity entries"
                icon={Users}
              />
              <StatTile
                label="User Management"
                value={String(activityTotals.users)}
                note="Create, deactivate, reactivate, and delete actions"
                icon={UserCog}
              />
              <StatTile
                label="Role Changes"
                value={String(activityTotals.roles)}
                note="Role updates applied by the admin team"
                icon={KeyRound}
              />
              <StatTile
                label="Invite Events"
                value={String(activityTotals.invites)}
                note="Setup invites sent or resent"
                icon={ShieldAlert}
              />
            </>
          ) : (
            <>
              <StatTile
                label="Authentication"
                value={String(securityTotals.authentication)}
                note="Login success, failure, blocking, and logout activity"
                icon={ShieldAlert}
              />
              <StatTile
                label="Sessions"
                value={String(securityTotals.sessions)}
                note="Session timeout and revocation activity"
                icon={Users}
              />
              <StatTile
                label="Passwords"
                value={String(securityTotals.password)}
                note="Password change, reset, and setup activity"
                icon={UserCog}
              />
              <StatTile
                label="Tokens"
                value={String(securityTotals.token)}
                note="Password reset and setup link activity"
                icon={KeyRound}
              />
            </>
          )}
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-[#667085]">
                {activeTab === "ACTIVITY" ? "Activity Register" : "Security Register"}
              </p>
              <HelpTooltip
                text={
                  activeTab === "ACTIVITY"
                    ? "Review user management, role changes, and invite actions from one place."
                    : "Track security-specific account activity separately from the wider admin trail."
                }
              />
            </div>
            <p className="mt-1 text-[12px] text-[#667085]">
              {activeTab === "ACTIVITY"
                ? "Track admin account actions without mixing in login and security records."
                : "Keep security-only records in their own tab so the main activity view stays cleaner."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadLog}
            className="inline-flex items-center gap-2 rounded-[14px] bg-[#67c96d] px-4 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d]"
          >
            <Download className="h-4 w-4" />
            Download Log
          </button>
        </div>

        <div className="mt-5 border-b border-[#eef2f6]">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("ACTIVITY")}
              className={[
                "rounded-t-[14px] px-4 py-2.5 text-sm font-semibold transition",
                activeTab === "ACTIVITY"
                  ? "border-b-2 border-[#67c96d] text-[#101828]"
                  : "text-[#98a2b3] hover:text-[#475467]",
              ].join(" ")}
            >
              Activity
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("SECURITY")}
              className={[
                "rounded-t-[14px] px-4 py-2.5 text-sm font-semibold transition",
                activeTab === "SECURITY"
                  ? "border-b-2 border-[#67c96d] text-[#101828]"
                  : "text-[#98a2b3] hover:text-[#475467]",
              ].join(" ")}
            >
              Security
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by user, role, or event"
              className="w-full rounded-[14px] border border-[#dde4ef] bg-white py-3 pl-11 pr-4 text-sm text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
            />
          </label>

          {activeTab === "ACTIVITY" ? (
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
              className="min-w-[170px] rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
            >
              <option value="ALL">All categories</option>
              <option value="User Management">User Management</option>
              <option value="Role Change">Role Change</option>
              <option value="Invite">Invite</option>
            </select>
          ) : (
            <select
              value={securityCategoryFilter}
              onChange={(event) =>
                setSecurityCategoryFilter(event.target.value)
              }
              className="min-w-[190px] rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
            >
              <option value="ALL">All categories</option>
              <option value="Authentication">Authentication</option>
              <option value="Session">Session</option>
              <option value="Password">Password</option>
              <option value="Token">Token</option>
            </select>
          )}

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="min-w-[170px] rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          {activeTab === "ACTIVITY" ? (
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
                {loadingLogs ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-[13px] text-[#667085]"
                    >
                      Loading audit records...
                    </td>
                  </tr>
                ) : filteredActivityLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-[13px] text-[#667085]"
                    >
                      No audit records match the current filters.
                    </td>
                  </tr>
                ) : (
                  pagedLogs.map((item) => {
                    const auditItem = item as AuditEvent;

                    return (
                      <tr key={auditItem.id}>
                        <td className="py-4 pr-4 align-middle text-[13px] font-medium text-[#101828]">
                          {auditItem.user_name}
                        </td>
                        <td className="py-4 pr-4 align-middle text-[13px] text-[#344054]">
                          {displayRole(auditItem.user_role)}
                        </td>
                        <td className="py-4 pr-4 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${(ACTIVITY_CATEGORY_META[auditItem.category] || { tone: "bg-slate-100 text-slate-700" }).tone}`}
                          >
                            {(ACTIVITY_CATEGORY_META[auditItem.category] || { label: auditItem.category }).label}
                          </span>
                        </td>
                        <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                          {auditItem.event}
                        </td>
                        <td className="py-4 align-middle whitespace-nowrap text-[13px] text-[#475467]">
                          {formatAuditTimestamp(auditItem.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full divide-y divide-[#eef2f6]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f8]">
                {loadingLogs ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-[13px] text-[#667085]"
                    >
                      Loading security records...
                    </td>
                  </tr>
                ) : filteredSecurityLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-[13px] text-[#667085]"
                    >
                      No security records match the current filters.
                    </td>
                  </tr>
                ) : (
                  pagedLogs.map((item) => {
                    const securityItem = item as AuditEvent;

                    return (
                      <tr key={securityItem.id}>
                        <td className="py-4 pr-4 align-middle text-[13px] font-medium text-[#101828]">
                          {securityItem.user_name}
                        </td>
                        <td className="py-4 pr-4 align-middle text-[13px] text-[#344054]">
                          {displayRole(securityItem.user_role)}
                        </td>
                        <td className="py-4 pr-4 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${(SECURITY_CATEGORY_META[securityItem.category] || { tone: "bg-slate-100 text-slate-700" }).tone}`}
                          >
                            {(SECURITY_CATEGORY_META[securityItem.category] || { label: securityItem.category }).label}
                          </span>
                        </td>
                        <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                          {securityItem.event}
                        </td>
                        <td className="py-4 align-middle whitespace-nowrap text-[13px] text-[#475467]">
                          {formatAuditTimestamp(securityItem.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f6] pt-4">
          <p className="text-[12px] text-[#667085]">
            Showing{" "}
            <span className="font-semibold text-[#344054]">
              {filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            {" "}to{" "}
            <span className="font-semibold text-[#344054]">
              {Math.min(currentPage * pageSize, filteredLogs.length)}
            </span>
            {" "}of{" "}
            <span className="font-semibold text-[#344054]">
              {filteredLogs.length}
            </span>
            {" "}entries
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className="rounded-[12px] border border-[#dde4ef] bg-white px-3 py-2 text-[12px] font-semibold text-[#344054] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={[
                  "h-9 min-w-9 rounded-[12px] px-3 text-[12px] font-semibold transition",
                  page === currentPage
                    ? "bg-[#67c96d] text-[#08111f]"
                    : "border border-[#dde4ef] bg-white text-[#344054] hover:bg-[#f7f9fc]",
                ].join(" ")}
              >
                {page}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              disabled={currentPage === totalPages}
              className="rounded-[12px] border border-[#dde4ef] bg-white px-3 py-2 text-[12px] font-semibold text-[#344054] transition hover:bg-[#f7f9fc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
