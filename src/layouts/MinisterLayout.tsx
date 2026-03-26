// src/layouts/MinisterLayout.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronDown,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
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
  /** Controls whether the dropdown shows "Settings" or "Dashboard" */
  currentPage?: "dashboard" | "settings";
  topTabs?: LayoutTab[];
  activeTopTab?: string;
  onSelectTopTab?: (key: string) => void;
}) {
  const userName = localStorage.getItem("user_name") || "Minister";
  const userType = "Minister";

  const initials = useMemo(() => {
    const parts = userName.split(" ").filter(Boolean);
    const a = parts[0]?.[0] ?? "M";
    const b = parts[parts.length - 1]?.[0] ?? "U";
    return (a + b).toUpperCase();
  }, [userName]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ── BLACK TOP BAR (sticky) ── */}
      <div className="sticky top-0 z-[70] bg-[#020617] text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <div className="flex shrink-0 items-center gap-3">
            <img src={nediLogo} alt="NEDI" className="h-10 w-auto" />
          </div>

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

          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-3 rounded-full px-3 py-2 transition hover:bg-white/10"
            >
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold">{userName}</div>
                <div className="text-xs text-white/70">{userType}</div>
              </div>

              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-black">
                {initials}
              </div>

              <ChevronDown className="w-4 h-4 text-white/80" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white text-black rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                {currentPage === "settings" ? (
                  <button
                    onClick={() => { setMenuOpen(false); onGoDashboard(); }}
                    className="w-full px-4 py-3 flex items-center gap-2 hover:bg-slate-50"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </button>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                    className="w-full px-4 py-3 flex items-center gap-2 hover:bg-slate-50"
                  >
                    <SettingsIcon className="w-4 h-4" />
                    Settings
                  </button>
                )}

                {/*
                  Logout: do NOT touch localStorage here.
                  logoutDummy() is called by App.tsx's logout() function
                  which is passed down as onLogout. This component only
                  needs to call the prop — nothing else.
                */}
                <button
                  onClick={() => { setMenuOpen(false); onLogout(); }}
                  className="w-full px-4 py-3 flex items-center gap-2 hover:bg-slate-50 text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PAGE CONTENT ── */}
      {children}
    </div>
  );
}
