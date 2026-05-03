import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  ServerCog,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import nediLogo from "../shared/assets/nedi-logo.png";
import nediMark from "../shared/assets/nedi-mark.png";

export type AdminPageKey =
  | "overview"
  | "users"
  | "activity"
  | "system"
  | "settings";

const NAV_ITEMS: Array<{
  key: AdminPageKey;
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "Overview", to: "/admin", icon: LayoutDashboard },
  {
    key: "users",
    label: "User Management",
    to: "/admin/users",
    icon: UsersRound,
  },
  {
    key: "activity",
    label: "Audit Logs",
    to: "/admin/activity",
    icon: Activity,
  },
  {
    key: "system",
    label: "System",
    to: "/admin/system",
    icon: ServerCog,
  },
  {
    key: "settings",
    label: "Settings",
    to: "/admin/settings",
    icon: Settings,
  },
];

function formatHeaderTime(value: Date) {
  return value.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminLayout({
  children,
  currentPage,
  onLogout,
}: {
  children: ReactNode;
  currentPage: AdminPageKey;
  onLogout: () => void;
}) {
  const userName = localStorage.getItem("user_name") || "System Admin";
  const userType = "System Administrator";
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const initials = useMemo(() => {
    const parts = userName.split(" ").filter(Boolean);
    const first = parts[0]?.[0] ?? "S";
    const last = parts[parts.length - 1]?.[0] ?? "A";
    return `${first}${last}`.toUpperCase();
  }, [userName]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside
          className={[
            "relative w-full border-b border-[#111827] bg-[#020617] text-white transition-[width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-r-[#0f172a]",
            sidebarOpen ? "lg:w-[228px]" : "lg:w-[78px]",
          ].join(" ")}
        >
          <div
            className={[
              "flex h-full min-h-screen flex-col pb-5 pt-4 lg:min-h-0 lg:h-screen lg:pt-5",
              sidebarOpen ? "px-3 lg:px-3" : "px-2 lg:px-2",
            ].join(" ")}
          >
            <div className="border-b border-white/10 pb-4">
              <div className="relative flex min-h-[42px] items-center justify-center pr-7">
                {sidebarOpen ? (
                  <div className="overflow-hidden">
                    <img
                      src={nediLogo}
                      alt="NEDI"
                      className="block h-8 w-auto max-w-none"
                    />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center">
                    <img
                      src={nediMark}
                      alt="NEDI"
                      className="block h-9 w-9 object-contain"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSidebarOpen((value) => !value)}
                  aria-label={
                    sidebarOpen ? "Collapse sidebar" : "Expand sidebar"
                  }
                  className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {sidebarOpen ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <nav className="mt-6 flex flex-1 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.key === currentPage;

                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    title={item.label}
                    className={[
                      "inline-flex min-w-fit items-center gap-3 rounded-[6px] px-3 py-2.5 text-[13px] font-medium transition-all",
                      sidebarOpen ? "" : "justify-center px-0",
                      active
                        ? "bg-[#73d66a] text-[#08111f]"
                        : "text-white/78 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {sidebarOpen ? <span>{item.label}</span> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={onLogout}
                title="Logout"
                className={[
                  "inline-flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-[13px] font-medium text-[#ff8087] transition hover:bg-[#3b0d14] hover:text-[#ff9ca2]",
                  sidebarOpen ? "" : "justify-center px-0",
                ].join(" ")}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {sidebarOpen ? <span>Logout</span> : null}
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-40 border-b border-[#e4e8ef] bg-white">
            <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#4b5563]">
                  {formatHeaderTime(currentTime)}
                </div>
              </div>

              <div className="shrink-0">
                <div className="flex items-center gap-3 rounded-full px-1 py-1">
                  <div className="text-right leading-tight">
                    <div className="text-[12px] font-medium text-[#111827]">
                      {userName}
                    </div>
                    <div className="text-[11px] text-[#7b8494]">{userType}</div>
                  </div>

                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#67c96d] text-[10px] font-bold text-white">
                    {initials}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1240px] px-4 py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
