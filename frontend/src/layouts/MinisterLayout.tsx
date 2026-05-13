// src/layouts/MinisterLayout.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings,
} from "lucide-react";
import nediLogo from "../shared/assets/nedi-logo.png";

type LayoutTab = {
  key: string;
  label: string;
};

export default function MinisterLayout({
  children,
  onLogout,
  onOpenSettings,
  onGoDashboard,
  currentPage = "dashboard",
  topTabs = [],
  activeTopTab,
  onSelectTopTab,
}: {
  children: ReactNode;
  onLogout: () => void;
  onOpenSettings: () => void;
  onGoDashboard: () => void;
  /** Controls whether dashboard top tabs are shown. */
  currentPage?: "dashboard" | "settings";
  topTabs?: LayoutTab[];
  activeTopTab?: string;
  onSelectTopTab?: (key: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const userName = localStorage.getItem("user_name") || "Minister";
  const userEmail = localStorage.getItem("user_email") || "";
  const userRole =
    localStorage.getItem("user_role") || localStorage.getItem("nedi_role") || "";
  const userType = formatRoleLabel(userRole);

  const initials = useMemo(() => {
    const parts = userName.split(" ").filter(Boolean);
    const first = parts[0]?.[0] ?? "M";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return `${first}${last}`.toUpperCase();
  }, [userName]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-[70] bg-[#020617] text-white shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 py-2">
          <button
            type="button"
            onClick={onGoDashboard}
            className="flex shrink-0 items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-[#020617]"
            aria-label="Go to dashboard"
          >
            <img src={nediLogo} alt="NEDI" className="h-10 w-auto" />
          </button>

          {currentPage === "dashboard" && topTabs.length > 0 ? (
            <div className="flex min-w-0 flex-1 justify-center">
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-white/10 p-1 scrollbar-none">
                {topTabs.map((tab) => {
                  const isActive = tab.key === activeTopTab;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => onSelectTopTab?.(tab.key)}
                      className={[
                        "whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-emerald-500 text-slate-950 shadow-sm"
                          : "text-white/70 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div ref={menuRef} className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/8 pl-1.5 pr-3 text-left transition hover:bg-white/12 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-[#020617]"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950">
                {initials}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block">
                <span className="block max-w-[140px] truncate text-xs font-semibold text-white">
                  {userName}
                </span>
                <span className="block max-w-[140px] truncate text-[10px] text-white/58">
                  {userType}
                </span>
              </span>
              <ChevronDown
                className={[
                  "h-4 w-4 text-white/60 transition-transform",
                  menuOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl"
              >
                <div className="border-b border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {userName}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {userEmail || userType}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onGoDashboard)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <LayoutDashboard className="h-4 w-4 text-slate-500" />
                    Dashboard
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onOpenSettings)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    Settings
                  </button>
                </div>

                <div className="border-t border-slate-100 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runMenuAction(onLogout)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

function formatRoleLabel(role: string) {
  const normalized = role.trim().toUpperCase();
  if (normalized === "SYSTEM_ADMIN") return "System Administrator";
  if (normalized === "STATE_ADMIN") return "State Administrator";
  return "Minister";
}
