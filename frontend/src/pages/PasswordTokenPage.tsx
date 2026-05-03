import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../app/api";
import AuthPageShell from "./AuthPageShell";

type PasswordTokenMode = "reset" | "setup";

type PasswordTokenPageProps = {
  mode: PasswordTokenMode;
};

type PasswordFormErrors = {
  newPassword?: string;
  confirmPassword?: string;
  form?: string;
};

export default function PasswordTokenPage({
  mode,
}: PasswordTokenPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<PasswordFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const copy = useMemo(
    () =>
      mode === "setup"
        ? {
            title: "Set your password",
            description:
              "Create your password to finish setting up your NEDI account.",
            submitLabel: "Set Password",
            submittingLabel: "Saving password...",
            successQuery: "setupComplete=1",
            successLinkLabel: "Continue to Sign In",
          }
        : {
            title: "Choose a new password",
            description:
              "Enter your new password twice to complete the reset securely.",
            submitLabel: "Reset Password",
            submittingLabel: "Updating password...",
            successQuery: "passwordReset=1",
            successLinkLabel: "Return to Sign In",
          },
    [mode]
  );

  const validateForm = () => {
    const nextErrors: PasswordFormErrors = {};

    if (!token) {
      nextErrors.form = "This password link is missing or invalid.";
    }

    if (!formData.newPassword) {
      nextErrors.newPassword = "New password is required";
    } else if (formData.newPassword.length < 8) {
      nextErrors.newPassword = "Password must be at least 8 characters";
    }

    if (!formData.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your new password";
    } else if (formData.confirmPassword !== formData.newPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const response =
        mode === "setup"
          ? await authApi.setupPassword(token, formData.newPassword)
          : await authApi.resetPassword(token, formData.newPassword);

      setSuccessMessage(response.message);
      setErrors({});
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
            : "Unable to update password right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <AuthPageShell
        title="Password updated"
        description="Your password has been saved successfully."
      >
        <div className="rounded-2xl border border-white/12 bg-white/6 p-6 text-center backdrop-blur-sm">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
          <p className="text-sm leading-6 text-white/78">
            {successMessage}
          </p>

          <Link
            to={`/login?${copy.successQuery}`}
            className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2"
          >
            {copy.successLinkLabel}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title={copy.title}
      description={copy.description}
      backLink={{ to: "/login", label: "Back to sign in" }}
      notice={
        !token ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-red-100">
            This password link is missing its token. Please use the full link
            from your email or request a new one.
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errors.form ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errors.form}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="newPassword"
            className="mb-2 block text-sm font-medium text-white/88"
          >
            New Password
          </label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type={showPasswords ? "text" : "password"}
              id="newPassword"
              name="newPassword"
              value={formData.newPassword}
              onChange={(e) => {
                setFormData((current) => ({
                  ...current,
                  newPassword: e.target.value,
                }));
                setErrors((current) => ({
                  ...current,
                  newPassword: undefined,
                  form: undefined,
                }));
              }}
              className={`input-field ${
                errors.newPassword ? "border-destructive ring-destructive/20" : ""
              }`}
              style={{ paddingLeft: 52, paddingRight: 52 }}
              placeholder="Enter your new password"
            />

            <button
              type="button"
              onClick={() => setShowPasswords((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle password visibility"
            >
              {showPasswords ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          {errors.newPassword ? (
            <p className="text-destructive text-sm mt-1">{errors.newPassword}</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-2 block text-sm font-medium text-white/88"
          >
            Confirm New Password
          </label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type={showPasswords ? "text" : "password"}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => {
                setFormData((current) => ({
                  ...current,
                  confirmPassword: e.target.value,
                }));
                setErrors((current) => ({
                  ...current,
                  confirmPassword: undefined,
                  form: undefined,
                }));
              }}
              className={`input-field ${
                errors.confirmPassword
                  ? "border-destructive ring-destructive/20"
                  : ""
              }`}
              style={{ paddingLeft: 52, paddingRight: 16 }}
              placeholder="Type your new password again"
            />
          </div>

          {errors.confirmPassword ? (
            <p className="text-destructive text-sm mt-1">
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              {copy.submittingLabel}
            </>
          ) : (
            <>
              {copy.submitLabel}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {mode === "reset" ? (
          <p className="text-center text-sm text-white/62">
            Need a fresh link?{" "}
            <Link to="/forgot-password" className="text-primary hover:underline">
              Request another reset email
            </Link>
          </p>
        ) : null}
      </form>
    </AuthPageShell>
  );
}
