import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import defaultAuthLogo from "../shared/assets/nedi-logo2.png";
import authBackground from "../shared/assets/MG_0713.webp";

type AuthPageShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  backgroundImage?: string | null;
  logoSrc?: string;
  backLink?: {
    to: string;
    label: string;
  };
};

export default function AuthPageShell({
  title,
  description,
  children,
  notice,
  footer,
  backgroundImage,
  logoSrc,
  backLink,
}: AuthPageShellProps) {
  const resolvedBackgroundImage =
    backgroundImage === undefined ? authBackground : backgroundImage;
  const resolvedLogoSrc = logoSrc ?? defaultAuthLogo;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 py-12 px-4">
      {resolvedBackgroundImage ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${resolvedBackgroundImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/88 via-slate-950/66 to-nedi-green-dark/50" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-nedi-green-light/30" />
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md items-center"
      >
        <div
          className={`w-full rounded-2xl border p-8 shadow-soft ${
            resolvedBackgroundImage
              ? "border-white/15 bg-slate-950/62 backdrop-blur-xl"
              : "border-border bg-card"
          }`}
        >
          <div className="text-center mb-8">
            <Link to="/login" className="inline-block" aria-label="Go to sign in">
              <img
                src={resolvedLogoSrc}
                alt="NEDI Logo"
                className="h-12 w-auto mx-auto mb-4"
              />
            </Link>

            <h1
              className={`text-2xl font-bold ${
                resolvedBackgroundImage ? "text-white" : "text-foreground"
              }`}
            >
              {title}
            </h1>
            <p
              className={`mt-2 text-sm ${
                resolvedBackgroundImage ? "text-white/72" : "text-muted-foreground"
              }`}
            >
              {description}
            </p>
          </div>

          {notice ? <div className="mb-6">{notice}</div> : null}
          {children}
          {footer ? <div className="mt-6">{footer}</div> : null}
          {backLink ? (
            <div
              className={`mt-6 border-t pt-5 text-center ${
                resolvedBackgroundImage ? "border-white/10" : "border-border"
              }`}
            >
              <Link
                to={backLink.to}
                className={`text-sm transition-colors ${
                  resolvedBackgroundImage
                    ? "text-white/82 hover:text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {backLink.label}
              </Link>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
