import { motion } from "framer-motion";
import { ArrowLeft, Compass, SearchX } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { homeRouteForRole, isAuthed } from "../app/auth";
import pageBackground from "../shared/assets/MG_0713.webp";
import pageLogo from "../shared/assets/Primary Logo 2.png";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const authed = isAuthed();
  const fallbackRoute = authed ? homeRouteForRole() : "/login";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${pageBackground})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950/92 via-slate-950/78 to-nedi-green-dark/45" />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center"
      >
        <div className="w-full rounded-[28px] border border-white/12 bg-slate-950/64 p-8 text-white shadow-2xl backdrop-blur-xl md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <img
                src={pageLogo}
                alt="NEDI"
                className="mb-6 h-12 w-auto"
              />

              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[12px] font-medium uppercase tracking-[0.18em] text-white/72">
                <SearchX className="h-4 w-4" />
                Page not found
              </div>

              <div className="mb-3 text-5xl font-semibold leading-none text-white/90 md:text-6xl">
                404
              </div>

              <h1 className="text-3xl font-semibold text-white md:text-[2.5rem] md:leading-tight">
                We couldn&apos;t find that page.
              </h1>

              <p className="mt-4 max-w-lg text-[15px] leading-7 text-white/72">
                The link may be outdated, typed incorrectly, or not available in
                this view. Let&apos;s get you back to a working page.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/6 p-5 text-sm text-white/78 md:w-[280px]">
              <div className="mb-3 flex items-center gap-2 text-white">
                <Compass className="h-4 w-4 text-[#73d66a]" />
                <span className="font-medium">Quick recovery</span>
              </div>
              <p className="leading-6 text-white/68">
                Use the dashboard button if you want to return to the main
                workspace, or go back if you were following a link inside the
                platform.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row">
            <Link
              to={fallbackRoute}
              className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#67c96d] px-5 py-3 text-sm font-semibold text-[#08111f] transition hover:bg-[#57b85d]"
            >
              <Compass className="h-4 w-4" />
              {authed ? "Return to dashboard" : "Go to sign in"}
            </Link>

            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                  return;
                }
                navigate(fallbackRoute, { replace: true });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-white/14 bg-white/6 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
