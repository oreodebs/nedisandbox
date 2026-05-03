import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../app/api";
import {
  buildDisplayName,
  consumeAuthNotice,
  loginWithSession,
  normalizeRole,
} from "../app/auth";
import AuthPageShell from "./AuthPageShell";
import loginBackground from "../shared/assets/MG_0713.webp";
import primaryLogo2 from "../shared/assets/Primary Logo 2.png";

type LoginPageProps = {
  onLogin: () => void;
};

type LoginErrors = {
  email?: string;
  password?: string;
  form?: string;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [searchParams] = useSearchParams();
  const [sessionNotice] = useState(() => consumeAuthNotice());
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  const pageNotice =
    sessionNotice ??
    (searchParams.get("passwordReset") === "1"
      ? "Password updated successfully. You can now sign in with your new password."
      : searchParams.get("setupComplete") === "1"
        ? "Password setup complete. Sign in to continue."
        : null);

  const validateForm = () => {
    const nextErrors: LoginErrors = {};

    if (!formData.email) {
      nextErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = "Please enter a valid email";
    }

    if (!formData.password) {
      nextErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      setErrors({});
      const email = formData.email.trim();

      const response = await authApi.login(email, formData.password);

      loginWithSession({
        role: normalizeRole(response.user.role),
        name: buildDisplayName(
          response.user.first_name,
          response.user.last_name,
          "User",
        ),
        firstName: response.user.first_name,
        lastName: response.user.last_name,
        email: response.user.email,
        accessToken: response.access_token,
        assignedState: response.user.assigned_state,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      onLogin();
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
            : "Sign in failed. Check the account details and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));

    setErrors((current) => ({
      ...current,
      [e.target.name]: undefined,
      form: undefined,
    }));
  };

  return (
    <AuthPageShell
      title="Welcome back"
      description="Sign in to access the NEDI portal"
      backgroundImage={loginBackground}
      logoSrc={primaryLogo2}
      notice={
        pageNotice ? (
          <div className="rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white/88">
            {pageNotice}
          </div>
        ) : null
      }
      footer={
        <p className="text-center text-sm text-white/62">
          Don&apos;t have an account?{" "}
          <span className="text-primary font-medium">
            Contact your NEDI system administrator.
          </span>
        </p>
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
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-white/88"
          >
            Email Address
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`input-field ${
                errors.email ? "border-destructive ring-destructive/20" : ""
              }`}
              style={{ paddingLeft: 52, paddingRight: 16 }}
              placeholder="Enter your email"
            />
          </div>

          {errors.email ? (
            <p className="text-destructive text-sm mt-1">{errors.email}</p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium text-white/88"
          >
            Password
          </label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={`input-field ${
                errors.password ? "border-destructive ring-destructive/20" : ""
              }`}
              style={{ paddingLeft: 52, paddingRight: 52 }}
              placeholder="Enter your password"
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle password"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          {errors.password ? (
            <p className="text-destructive text-sm mt-1">{errors.password}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
            />
            <span className="text-sm text-white/68">Remember me</span>
          </label>

          <Link
            to="/forgot-password"
            className="text-sm text-primary hover:text-primary/80 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthPageShell>
  );
}
