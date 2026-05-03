import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Save,
  ShieldCheck,
  User,
  UserRound,
  X,
} from "lucide-react";
import { authApi } from "../app/api";
import {
  buildDisplayName,
  getAccessToken,
  getAssignedState,
  getRole,
  type Role,
} from "../app/auth";

type SettingsPageProps = {
  onLogout: () => void;
};

type ToastState = {
  variant?: "default" | "destructive";
  title: string;
  description?: string;
} | null;

function formatRoleLabel(role: Role | null) {
  if (role === "SYSTEM_ADMIN") return "System Admin";
  if (role === "STATE_ADMIN") return "State Admin";
  return "Minister";
}

export default function SettingsPage({ onLogout }: SettingsPageProps) {
  void onLogout;

  const role = getRole();
  const assignedState = getAssignedState();
  const [toastState, setToastState] = useState<ToastState>(null);
  const [userData, setUserData] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [pwErrors, setPwErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
  }>({});
  const displayName = useMemo(
    () => buildDisplayName(userData.firstName, userData.lastName, "User"),
    [userData.firstName, userData.lastName],
  );
  const initials = useMemo(() => {
    const first = userData.firstName.trim()[0] ?? "N";
    const last = userData.lastName.trim()[0] ?? "D";
    return `${first}${last}`.toUpperCase();
  }, [userData.firstName, userData.lastName]);

  useEffect(() => {
    if (!toastState) return;
    const timer = window.setTimeout(() => setToastState(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toastState]);

  useEffect(() => {
    const storedFirstName = localStorage.getItem("user_first_name") || "";
    const storedLastName = localStorage.getItem("user_last_name") || "";
    const storedName = localStorage.getItem("user_name") || "User";
    const fallbackParts = storedName.split(" ").filter(Boolean);

    setUserData({
      firstName: storedFirstName || fallbackParts[0] || "",
      lastName:
        storedLastName ||
        (fallbackParts.length > 1 ? fallbackParts.slice(1).join(" ") : ""),
      email: localStorage.getItem("user_email") || "",
    });
  }, []);

  const toast = (nextToast: ToastState) => setToastState(nextToast);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);

    try {
      const firstName = userData.firstName.trim();
      const lastName = userData.lastName.trim();

      if (!firstName || !lastName) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: "First name and last name are both required.",
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 350));
      localStorage.setItem("user_first_name", firstName);
      localStorage.setItem("user_last_name", lastName);
      localStorage.setItem("user_name", `${firstName} ${lastName}`);

      toast({
        title: "Profile updated",
        description: "Your account details have been saved successfully.",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const validatePasswordForm = () => {
    const nextErrors: typeof pwErrors = {};

    if (!passwords.current) nextErrors.current = "Current password is required";
    if (!passwords.new) {
      nextErrors.new = "New password is required";
    } else if (passwords.new.length < 8) {
      nextErrors.new = "Password must be at least 8 characters";
    }
    if (!passwords.confirm) {
      nextErrors.confirm = "Please confirm your new password";
    } else if (passwords.new !== passwords.confirm) {
      nextErrors.confirm = "Passwords do not match";
    }

    setPwErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Please sign in again before changing your password.",
        });
        return;
      }

      setPwErrors({});
      await authApi.changePassword(
        accessToken,
        passwords.current,
        passwords.new,
      );

      setPasswords({ current: "", new: "", confirm: "" });
      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Password update failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to change password right now.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-2">
      {toastState ? (
        <div
          className={[
            "fixed bottom-6 right-6 z-[140] w-[min(360px,calc(100vw-2rem))] rounded-[18px] border px-4 py-3 text-sm shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur",
            toastState.variant === "destructive"
              ? "border-red-200 bg-red-50/95 text-red-700"
              : "border-emerald-200 bg-emerald-50/95 text-emerald-800",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{toastState.title}</div>
              {toastState.description ? (
                <div className="mt-1 text-[13px] leading-5 opacity-90">
                  {toastState.description}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setToastState(null)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-[24px] border border-[#e4e9f1] bg-white px-6 py-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#eef9ec] text-[20px] font-semibold text-[#2f7a38]">
              {initials}
            </div>

            <div className="min-w-0">
              <p className="truncate text-[22px] font-semibold tracking-[-0.03em] text-[#101828]">
                {displayName}
              </p>
              <p className="truncate text-[13px] text-[#667085]">
                {userData.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill>{formatRoleLabel(role)}</Pill>
            {assignedState ? <Pill>{assignedState}</Pill> : null}
          </div>
        </div>
      </motion.div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AnimatedCard delay={0.05} className="p-6 lg:p-7">
          <div className="border-b border-[#eef2f6] pb-5">
            <p className="text-[18px] font-semibold text-[#101828]">
              Profile details
            </p>
            <p className="mt-1 text-[13px] text-[#667085]">
              Update the name shown across your account.
            </p>
          </div>

          <form onSubmit={handleProfileUpdate} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field
                label="First name"
                icon={User}
                value={userData.firstName}
                placeholder="Enter your first name"
                onChange={(value) =>
                  setUserData((current) => ({ ...current, firstName: value }))
                }
              />

              <Field
                label="Last name"
                icon={UserRound}
                value={userData.lastName}
                placeholder="Enter your last name"
                onChange={(value) =>
                  setUserData((current) => ({ ...current, lastName: value }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#344054]">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98a2b3]" />
                <input
                  type="email"
                  value={userData.email}
                  disabled
                  className="input-field cursor-not-allowed border-[#e3e8f1] bg-[#f7f9fc] pl-12 text-[#667085]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="inline-flex items-center gap-2 rounded-[14px] bg-[#67c96d] px-5 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d] disabled:opacity-50"
              >
                {isUpdatingProfile ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#08111f]/20 border-t-[#08111f]" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save profile
                  </>
                )}
              </button>
            </div>
          </form>
        </AnimatedCard>

        <AnimatedCard delay={0.1} className="p-6 lg:p-7">
          <div className="border-b border-[#eef2f6] pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef9ec] text-[#2f7a38]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[18px] font-semibold text-[#101828]">
                  Password
                </p>
                <p className="mt-1 text-[13px] text-[#667085]">
                  Change your password to keep your account secure.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="mt-6 space-y-5">
            {(
              [
                ["current", "Current password", "Enter current password"],
                ["new", "New password", "Enter new password"],
                ["confirm", "Confirm new password", "Confirm new password"],
              ] as const
            ).map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="mb-2 block text-sm font-medium text-[#344054]">
                  {label}
                </label>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98a2b3]" />
                  <input
                    type={showPasswords[field] ? "text" : "password"}
                    value={passwords[field]}
                    onChange={(e) => {
                      setPasswords((current) => ({
                        ...current,
                        [field]: e.target.value,
                      }));
                      if (pwErrors[field]) {
                        setPwErrors((current) => ({
                          ...current,
                          [field]: undefined,
                        }));
                      }
                    }}
                    className={`input-field border-[#dde4ef] pl-12 pr-12 ${
                      pwErrors[field]
                        ? "border-destructive ring-4 ring-destructive/10"
                        : ""
                    }`}
                    placeholder={placeholder}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((current) => ({
                        ...current,
                        [field]: !current[field],
                      }))
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#98a2b3] transition hover:text-[#475467]"
                    aria-label={`Toggle ${label.toLowerCase()} visibility`}
                  >
                    {showPasswords[field] ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {pwErrors[field] ? (
                  <p className="mt-2 text-sm text-destructive">
                    {pwErrors[field]}
                  </p>
                ) : null}
              </div>
            ))}

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-[14px] bg-[#67c96d] px-5 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d]"
              >
                <ShieldCheck className="h-4 w-4" />
                Change password
              </button>
            </div>
          </form>
        </AnimatedCard>
      </div>
    </div>
  );
}

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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={`rounded-[24px] border border-[#e4e9f1] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.05)] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#d9efe1] bg-[#eef9ec] px-3 py-1 text-[12px] font-medium text-[#2f7a38]">
      {children}
    </span>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  icon: typeof User;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#344054]">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98a2b3]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field border-[#dde4ef] pl-12"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
