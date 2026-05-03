import { useState } from "react";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { authApi } from "../app/api";
import AuthPageShell from "./AuthPageShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Email is required");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email");
      return false;
    }

    setError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail()) return;

    setIsSubmitting(true);
    try {
      const response = await authApi.forgotPassword(email.trim());
      setSuccessMessage(response.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to send reset link right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMessage) {
    return (
      <AuthPageShell
        title="Check your email"
        description="If the account exists, a secure password reset link is on the way."
      >
        <div className="rounded-2xl border border-white/12 bg-white/6 p-6 text-center backdrop-blur-sm">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
          <p className="text-sm leading-6 text-white/78">
            {successMessage}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/login"
              className="btn-primary inline-flex items-center justify-center gap-2"
            >
              Return to Sign In
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={() => {
                setSuccessMessage("");
                setEmail("");
              }}
              className="text-sm text-primary hover:underline"
            >
              Send another link
            </button>
          </div>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Forgot your password?"
      description="Enter your email address and we will send you a secure reset link."
      backLink={{ to: "/login", label: "Back to sign in" }}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              className={`input-field ${
                error ? "border-destructive ring-destructive/20" : ""
              }`}
              style={{ paddingLeft: 52, paddingRight: 16 }}
              placeholder="Enter your email"
            />
          </div>

          {error ? <p className="text-destructive text-sm mt-1">{error}</p> : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Sending link...
            </>
          ) : (
            <>
              Send Reset Link
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthPageShell>
  );
}
