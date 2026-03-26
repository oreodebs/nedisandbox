// src/pages/SettingsPage.tsx
// ─────────────────────────────────────────────────────────────
// This page is layout-agnostic. It renders only its own content.
// The correct layout wrapper (MinisterLayout, ExecutiveLayout, etc.)
// is applied by App.tsx in the route definition — not here.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Info,
  ArrowLeft,
} from "lucide-react";

type SettingsPageProps = {
  onBack: () => void;
  onLogout: () => void;
};

export default function SettingsPage({ onBack, onLogout }: SettingsPageProps) {
  // Suppress unused-var warning — onLogout is available for future use
  // (e.g. a logout button on this page if needed)
  void onLogout;

  const [toastState, setToastState] = useState<{
    variant?: "default" | "destructive";
    title: string;
    description?: string;
  } | null>(null);

  const toast = (t: typeof toastState) => {
    setToastState(t);
    window.clearTimeout((toast as any)._t);
    (toast as any)._t = window.setTimeout(() => setToastState(null), 2500);
  };

  const [userData, setUserData] = useState({
    name: "User",
    email: "",
  });

  useEffect(() => {
    setUserData({
      name: localStorage.getItem("user_name") || "User",
      email: localStorage.getItem("user_email") || "",
    });
  }, []);

  // ── Profile update ──────────────────────────────────────────
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const name = userData.name.trim();
      if (!name) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: "Name cannot be empty.",
        });
        return;
      }
      await new Promise((r) => setTimeout(r, 350));
      localStorage.setItem("user_name", name);
      toast({ title: "Profile updated", description: "Updated successfully. (dummy)" });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ── Password change ─────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [pwErrors, setPwErrors] = useState<{ current?: string; new?: string; confirm?: string }>(
    {}
  );
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const validatePasswordForm = () => {
    const errs: typeof pwErrors = {};
    if (!passwords.current) errs.current = "Current password is required";
    if (!passwords.new) errs.new = "New password is required";
    else if (passwords.new.length < 8) errs.new = "Password must be at least 8 characters";
    if (!passwords.confirm) errs.confirm = "Please confirm your new password";
    else if (passwords.new !== passwords.confirm) errs.confirm = "Passwords do not match";
    setPwErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;
    setIsChangingPassword(true);
    try {
      await new Promise((r) => setTimeout(r, 450));
      setPasswords({ current: "", new: "", confirm: "" });
      setPwErrors({});
      toast({ title: "Password updated", description: "Changed successfully. (dummy)" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage your account settings</p>
          </div>

          {/* ✅ Uses onBack so it won’t be “unused” */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary/40 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </motion.div>

      {toastState && (
        <div
          className={[
            "mb-6 rounded-xl border px-4 py-3 text-sm",
            toastState.variant === "destructive"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-card text-foreground",
          ].join(" ")}
        >
          <div className="font-semibold">{toastState.title}</div>
          {toastState.description && (
            <div className="text-muted-foreground mt-1">{toastState.description}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <AnimatedCard delay={0.05} className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">Personal Information</h2>

          <form onSubmit={handleProfileUpdate} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  value={userData.name}
                  onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                  className="input-field pl-12"
                  placeholder="Enter your name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                Email Address
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Email cannot be changed</p>
                  </TooltipContent>
                </Tooltip>
              </label>

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={userData.email}
                  disabled
                  className="input-field pl-12 bg-secondary/50 cursor-not-allowed text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Contact support to change your email address
              </p>
            </div>

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isUpdatingProfile ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                "Update Profile"
              )}
            </button>
          </form>
        </AnimatedCard>

        {/* Change Password */}
        <AnimatedCard delay={0.1} className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">Change Password</h2>

          <form onSubmit={handlePasswordChange} className="space-y-5">
            {(["current", "new", "confirm"] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {field === "current"
                    ? "Current Password"
                    : field === "new"
                    ? "New Password"
                    : "Confirm New Password"}
                </label>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type={showPasswords[field] ? "text" : "password"}
                    value={passwords[field]}
                    onChange={(e) => {
                      setPasswords({ ...passwords, [field]: e.target.value });
                      if (pwErrors[field]) setPwErrors({ ...pwErrors, [field]: undefined });
                    }}
                    className={`input-field pl-12 pr-12 ${pwErrors[field] ? "border-destructive" : ""}`}
                    placeholder={
                      field === "current"
                        ? "Enter current password"
                        : field === "new"
                        ? "Enter new password"
                        : "Confirm new password"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((s) => ({ ...s, [field]: !s[field] }))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords[field] ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {pwErrors[field] && (
                  <p className="text-destructive text-sm mt-1">{pwErrors[field]}</p>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={isChangingPassword}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isChangingPassword ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Updating...
                </>
              ) : (
                "Change Password"
              )}
            </button>
          </form>
        </AnimatedCard>
      </div>
    </div>
  );
}

// ─── Local helpers ───────────────────────────────────────────

function AnimatedCard({
  delay = 0,
  className = "",
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
      className={`bg-card border border-border rounded-2xl shadow-sm ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return <span className="relative inline-flex group">{children}</span>;
}
function TooltipTrigger({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex cursor-help">{children}</span>;
}
function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute left-0 top-full mt-2 z-20 hidden group-hover:block">
      <span className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md whitespace-nowrap">
        {children}
      </span>
    </span>
  );
}
``