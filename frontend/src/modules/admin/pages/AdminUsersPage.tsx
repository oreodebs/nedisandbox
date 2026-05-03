import { useEffect, useMemo, useState } from "react";
import {
  CircleHelp,
  Mail,
  PencilLine,
  RefreshCcw,
  Search,
  TriangleAlert,
  Trash2,
  UserCheck,
  UserPlus2,
  UserRoundX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser, CreateUserRequest } from "../../../app/api";
import { usersApi } from "../../../app/api";
import { getAccessToken } from "../../../app/auth";

type Role = "SYSTEM_ADMIN" | "MINISTER" | "STATE_ADMIN";
type AccountStatus = "Active" | "Inactive";
type SetupStatus = "Pending" | "Completed";

type UserRecord = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  state: string | null;
  accountStatus: AccountStatus;
  setupStatus: SetupStatus;
  lastActivity: string;
};

const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Federal Capital Territory",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
];

const ROLE_META: Record<
  Role,
  { label: string; badge: string; summary: string }
> = {
  SYSTEM_ADMIN: {
    label: "System Admin",
    badge: "bg-transparent text-[#344054]",
    summary: "Full platform control",
  },
  MINISTER: {
    label: "Minister",
    badge: "bg-transparent text-[#344054]",
    summary: "National portal access",
  },
  STATE_ADMIN: {
    label: "State Admin",
    badge: "bg-transparent text-[#344054]",
    summary: "Single-state portal access",
  },
};

const ACCOUNT_STATUS_META: Record<AccountStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700",
  Inactive: "bg-slate-100 text-slate-700",
};

const SETUP_STATUS_META: Record<SetupStatus, string> = {
  Pending: "bg-amber-50 text-amber-700",
  Completed: "bg-sky-50 text-sky-700",
};

function formatBackendActivity(timestamp: string | null) {
  if (!timestamp) return "Updated recently";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Updated recently";

  return `Updated ${date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function displayUserName(user: Pick<UserRecord, "firstName" | "lastName">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

function userToRecord(user: AuthUser): UserRecord {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    role: user.role,
    state: user.assigned_state,
    accountStatus: user.is_active ? "Active" : "Inactive",
    setupStatus: user.must_change_password ? "Pending" : "Completed",
    lastActivity: formatBackendActivity(user.updated_at || user.created_at),
  };
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

export default function AdminUsersPage() {
  const accessToken = getAccessToken();
  const pageSize = 10;
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [accountStatusFilter, setAccountStatusFilter] =
    useState<"ALL" | AccountStatus>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);
  const [rowActionId, setRowActionId] = useState<number | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<UserRecord | null>(null);
  const [notice, setNotice] = useState<{
    kind: "success" | "error";
    message: string;
    setupUrl?: string | null;
  } | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "STATE_ADMIN" as Role,
    state: "Kaduna",
  });

  const totals = useMemo(() => {
    const active = users.filter((user) => user.accountStatus === "Active").length;
    const pending = users.filter((user) => user.setupStatus === "Pending").length;
    const inactive = users.filter(
      (user) => user.accountStatus === "Inactive",
    ).length;

    return {
      total: users.length,
      active,
      pending,
      inactive,
    };
  }, [users]);

  const loadUsers = async () => {
    if (!accessToken) {
      return;
    }

    setLoadingUsers(true);
    try {
      const response = await usersApi.list(accessToken);
      setUsers(response.map(userToRecord));
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load users from the backend right now.",
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setNotice({
        kind: "error",
        message:
          "Sign in with the real backend system admin account before testing user creation.",
      });
      return;
    }

    void loadUsers();
  }, [accessToken]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        needle === "" ||
        displayUserName(user).toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        (user.state ?? "").toLowerCase().includes(needle);

      const matchesRole = roleFilter === "ALL" || user.role === roleFilter;
      const matchesAccount =
        accountStatusFilter === "ALL" ||
        user.accountStatus === accountStatusFilter;

      return matchesQuery && matchesRole && matchesAccount;
    });
  }, [accountStatusFilter, query, roleFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [currentPage, filteredUsers]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 8500);

    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, roleFilter, accountStatusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      role: "STATE_ADMIN",
      state: "Kaduna",
    });
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload: CreateUserRequest = {
      email: form.email.trim(),
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      role: form.role,
      assigned_state: form.role === "STATE_ADMIN" ? form.state : null,
    };

    if (!payload.first_name || !payload.last_name || !payload.email) {
      return;
    }

    if (!accessToken) {
      setNotice({
        kind: "error",
        message:
          "Sign in with the real backend system admin account before creating users.",
      });
      return;
    }

    setSubmittingForm(true);
    try {
      if (editingId !== null) {
        await usersApi.update(accessToken, editingId, payload);
        setNotice({
          kind: "success",
          message: "User details updated successfully.",
        });
      } else {
        const response = await usersApi.create(accessToken, payload);
        setNotice({
          kind: "success",
          message: "User created and setup invitation sent.",
          setupUrl: response.setup_url,
        });
      }

      closeFormModal();
      await loadUsers();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "User details could not be saved right now.",
      });
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleEditUser = (user: UserRecord) => {
    setEditingId(user.id);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      state: user.state ?? "Kaduna",
    });
    setIsFormModalOpen(true);
  };

  const handleToggleAccountStatus = async (user: UserRecord) => {
    if (!accessToken) {
      setNotice({
        kind: "error",
        message:
          "Sign in with the real backend system admin account before updating user status.",
      });
      return;
    }

    setRowActionId(user.id);
    try {
      await usersApi.updateStatus(
        accessToken,
        user.id,
        user.accountStatus !== "Active",
      );
      setNotice({
        kind: "success",
        message:
          user.accountStatus === "Active"
            ? "User deactivated successfully."
            : "User reactivated successfully.",
      });
      await loadUsers();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "User status could not be updated right now.",
      });
    } finally {
      setRowActionId(null);
    }
  };

  const handleResendInvite = async (user: UserRecord) => {
    if (!accessToken) {
      setNotice({
        kind: "error",
        message:
          "Sign in with the real backend system admin account before resending setup links.",
      });
      return;
    }

    setRowActionId(user.id);
    try {
      const response = await usersApi.resendSetup(accessToken, user.id);
      setNotice({
        kind: "success",
        message: "Setup invitation sent again.",
        setupUrl: response.setup_url,
      });
      await loadUsers();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Setup invitation could not be resent right now.",
      });
    } finally {
      setRowActionId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteCandidate) return;

    if (!accessToken) {
      setNotice({
        kind: "error",
        message:
          "Sign in with the real backend system admin account before deleting users.",
      });
      setDeleteCandidate(null);
      return;
    }

    setRowActionId(deleteCandidate.id);
    try {
      await usersApi.delete(accessToken, deleteCandidate.id);
      setNotice({
        kind: "success",
        message: `${displayUserName(deleteCandidate)} was deleted successfully.`,
      });
      setDeleteCandidate(null);
      await loadUsers();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The user could not be deleted right now.",
      });
    } finally {
      setRowActionId(null);
    }
  };

  return (
    <div className="space-y-5">
      {notice ? (
        <div
          className={[
            "fixed bottom-6 right-6 z-[140] w-[min(360px,calc(100vw-2rem))] rounded-[18px] border px-4 py-3 text-sm shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur",
            notice.kind === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
              : "border-rose-200 bg-rose-50/95 text-rose-800",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{notice.message}</div>
              {notice.setupUrl ? (
                <a
                  href={notice.setupUrl}
                  className="mt-1 inline-flex text-[13px] font-medium underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open latest setup link for testing
                </a>
              ) : null}
            </div>
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
          <StatTile
            label="Total Users"
            value={String(totals.total)}
            note="All registered platform accounts"
            icon={Users}
          />
          <StatTile
            label="Active Users"
            value={String(totals.active)}
            note="Users currently enabled and active"
            icon={UserCheck}
          />
          <StatTile
            label="Pending Setups"
            value={String(totals.pending)}
            note="Accounts still waiting to finish setup"
            icon={Mail}
          />
          <StatTile
            label="Inactive Users"
            value={String(totals.inactive)}
            note="Accounts currently disabled or paused"
            icon={UserRoundX}
          />
        </div>
      </section>

      <section className="rounded-[20px] border border-[#e4e9f1] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-[#667085]">
                All Users
              </p>
              <HelpTooltip text="Manage user accounts here. Create, edit, deactivate, resend setup invites, or delete accounts after confirmation." />
            </div>
            <p className="mt-1 text-[12px] text-[#667085]">
              Create users from a popup and manage the current directory below
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-[#67c96d] px-4 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d]"
          >
            <UserPlus2 className="h-4 w-4" />
            Create User
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, or state"
              className="w-full rounded-[14px] border border-[#dde4ef] bg-white py-3 pl-11 pr-4 text-sm text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as "ALL" | Role)
            }
            className="min-w-[170px] rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
          >
            <option value="ALL">All roles</option>
            <option value="SYSTEM_ADMIN">System Admin</option>
            <option value="MINISTER">Minister</option>
            <option value="STATE_ADMIN">State Admin</option>
          </select>

          <select
            value={accountStatusFilter}
            onChange={(event) =>
              setAccountStatusFilter(event.target.value as "ALL" | AccountStatus)
            }
            className="min-w-[170px] rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
          >
            <option value="ALL">All account status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-[#eef2f6]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a2b3]">
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">State</th>
                <th className="pb-3 pr-4">Account</th>
                <th className="pb-3 pr-4">Setup</th>
                <th className="pb-3 pr-4">Last activity</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f3f8]">
              {loadingUsers ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-[13px] text-[#667085]"
                  >
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-[13px] text-[#667085]"
                  >
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                pagedUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="py-4 pr-4 align-middle">
                      <div className="font-medium text-[#101828]">
                        {displayUserName(user)}
                      </div>
                      <div className="mt-1 text-[12px] text-[#667085]">
                        {user.email}
                      </div>
                    </td>
                    <td className="py-4 pr-4 align-middle text-[13px] text-[#344054]">
                      <span
                        className={`inline-flex whitespace-nowrap align-middle rounded-full px-2.5 py-1 text-[13px] font-medium leading-none ${ROLE_META[user.role].badge}`}
                      >
                        {ROLE_META[user.role].label}
                      </span>
                    </td>
                    <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                      {user.state ? (
                        user.state
                      ) : (
                        <span
                          aria-hidden="true"
                          className="inline-block h-[2px] w-7 rounded-full bg-[#98a2b3] align-middle"
                        />
                      )}
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${ACCOUNT_STATUS_META[user.accountStatus]}`}
                      >
                        {user.accountStatus}
                      </span>
                    </td>
                    <td className="py-4 pr-4 align-middle">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${SETUP_STATUS_META[user.setupStatus]}`}
                      >
                        {user.setupStatus}
                      </span>
                    </td>
                    <td className="py-4 pr-4 align-middle text-[13px] text-[#475467]">
                      {user.lastActivity}
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditUser(user)}
                          className="inline-flex items-center gap-2 rounded-[12px] border border-[#dde4ef] bg-white px-3 py-2 text-[12px] font-semibold text-[#344054] transition hover:bg-[#f7f9fc]"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit
                        </button>

                        {user.setupStatus === "Pending" ? (
                          <button
                            type="button"
                            onClick={() => handleResendInvite(user)}
                            disabled={rowActionId === user.id}
                            className="inline-flex items-center gap-2 rounded-[12px] border border-[#dde4ef] bg-white px-3 py-2 text-[12px] font-semibold text-[#344054] transition hover:bg-[#f7f9fc]"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            {rowActionId === user.id ? "Sending..." : "Resend Invite"}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleToggleAccountStatus(user)}
                          disabled={rowActionId === user.id}
                          className="inline-flex items-center gap-2 rounded-[12px] border border-[#dde4ef] bg-white px-3 py-2 text-[12px] font-semibold text-[#344054] transition hover:bg-[#f7f9fc]"
                        >
                          <UserRoundX className="h-3.5 w-3.5" />
                          {rowActionId === user.id
                            ? "Saving..."
                            : user.accountStatus === "Active"
                              ? "Deactivate"
                              : "Reactivate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteCandidate(user)}
                          disabled={rowActionId === user.id}
                          className="inline-flex items-center gap-2 rounded-[12px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef2f6] pt-4">
          <p className="text-[12px] text-[#667085]">
            Showing{" "}
            <span className="font-semibold text-[#344054]">
              {filteredUsers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </span>
            {" "}to{" "}
            <span className="font-semibold text-[#344054]">
              {Math.min(currentPage * pageSize, filteredUsers.length)}
            </span>
            {" "}of{" "}
            <span className="font-semibold text-[#344054]">
              {filteredUsers.length}
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

      {isFormModalOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#08111f]/45 px-4 py-8">
          <div className="w-full max-w-[560px] rounded-[24px] bg-white p-6 shadow-[0_28px_80px_rgba(8,17,31,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[20px] font-semibold tracking-[-0.02em] text-[#101828]">
                  {editingId === null ? "Create User" : "Edit User"}
                </p>
                <p className="mt-1 text-[13px] text-[#667085]">
                  Add a new account, assign the correct role, and choose a state
                  for state admins.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e4e9f1] text-[#667085] transition hover:bg-[#f7f9fc]"
                aria-label="Close create user popup"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-[12px] font-medium text-[#344054]">
                  First name
                </span>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      firstName: event.target.value,
                    }))
                  }
                  placeholder="Enter first name"
                  className="w-full rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[12px] font-medium text-[#344054]">
                  Last name
                </span>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      lastName: event.target.value,
                    }))
                  }
                  placeholder="Enter last name"
                  className="w-full rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-[12px] font-medium text-[#344054]">
                  Email address
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                  placeholder="name@nedi.gov.ng"
                  className="w-full rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98a2b3] focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
                />
              </label>

              <label
                className={[
                  "block",
                  form.role === "STATE_ADMIN" ? "" : "md:col-span-2",
                ].join(" ")}
              >
                <span className="mb-2 block text-[12px] font-medium text-[#344054]">
                  Role
                </span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      role: event.target.value as Role,
                    }))
                  }
                  className="w-full rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
                >
                  <option value="SYSTEM_ADMIN">System Admin</option>
                  <option value="MINISTER">Minister</option>
                  <option value="STATE_ADMIN">State Admin</option>
                </select>
              </label>

              {form.role === "STATE_ADMIN" ? (
                <label className="block">
                  <span className="mb-2 block text-[12px] font-medium text-[#344054]">
                    Assigned state
                  </span>
                  <select
                    value={form.state}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        state: event.target.value,
                      }))
                    }
                    className="w-full rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#67c96d] focus:ring-4 focus:ring-[#67c96d]/10"
                  >
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="md:col-span-2 flex items-center justify-between gap-3 border-t border-[#eef2f6] pt-4">
                <p className="text-[12px] leading-5 text-[#667085]">
                  {form.role === "STATE_ADMIN"
                    ? `This account will open the minister portal already scoped to ${form.state}.`
                    : form.role === "MINISTER"
                      ? "This account will open the national minister portal."
                      : "This account will manage the platform from the admin side."}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeFormModal}
                    className="rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm font-semibold text-[#344054] transition hover:bg-[#f7f9fc]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingForm}
                    className="inline-flex min-w-[150px] items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-[#67c96d] px-4 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d]"
                  >
                    <UserPlus2 className="h-4 w-4" />
                    {submittingForm
                      ? editingId === null
                        ? "Creating..."
                        : "Saving..."
                      : editingId === null
                        ? "Create User"
                        : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-[#08111f]/45 px-4">
          <div className="w-full max-w-[460px] rounded-[24px] bg-white p-6 shadow-[0_28px_80px_rgba(8,17,31,0.22)]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[18px] font-semibold tracking-[-0.02em] text-[#101828]">
                  Delete user?
                </p>
                <p className="mt-1 text-[13px] leading-6 text-[#667085]">
                  You are about to delete {displayUserName(deleteCandidate)}. This
                  action removes the account and its active setup/session links.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-[14px] border border-[#dde4ef] bg-white px-4 py-3 text-sm font-semibold text-[#344054] transition hover:bg-[#f7f9fc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={rowActionId === deleteCandidate.id}
                className="inline-flex items-center gap-2 rounded-[14px] bg-[#ef3f45] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d9353b]"
              >
                <Trash2 className="h-4 w-4" />
                {rowActionId === deleteCandidate.id ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
