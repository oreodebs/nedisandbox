// src/layouts/MinisterLayout.tsx
import type { ReactNode } from "react";
import nediLogo from "../shared/assets/nedi-logo.png";

type LayoutTab = {
  key: string;
  label: string;
};

export default function MinisterLayout({
  children,
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
  return (
    <div className="min-h-screen bg-background">
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
        </div>
      </div>

      {children}
    </div>
  );
}
