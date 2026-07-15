import { Link, NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="relative min-h-screen bg-noise text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 border-grid opacity-40" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      <header className="sticky top-0 z-40 border-b border-border/60 backdrop-blur-xl bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
          <Link to="/" className="group flex items-center gap-2.5">
            <BrandMark />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-semibold tracking-tight text-glow-cyan">
                Neon AI Lab
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Video Intelligence
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavTab to="/" label="Home" active={pathname === "/"} />
            <NavTab
              to="/dashboard"
              label="Studio"
              active={pathname.startsWith("/dashboard") || pathname.startsWith("/studio")}
            />
            <a
              href="https://convex.dev"
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Demo Mode
            </a>
          </nav>
          <Link
            to="/dashboard"
            className="md:hidden inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-secondary/60 px-2.5 py-1.5 text-xs text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Studio
          </Link>
        </div>
      </header>

      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
        className="relative z-10"
      >
        {children}
      </motion.main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-7xl px-5">
          Neon AI Lab · Demo build · pipelines simulate against local Convex
          state.
        </div>
      </footer>
    </div>
  );
}

function NavTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={cn(
        "relative rounded-md px-3 py-1.5 text-sm transition",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute inset-0 -z-10 rounded-md bg-primary/10 ring-1 ring-primary/40"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
    </NavLink>
  );
}

function BrandMark() {
  return (
    <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-primary/40 bg-primary/10 shadow-[inset_0_0_30px_rgba(0,243,255,0.18)]">
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/30 via-transparent to-accent/30" />
      <svg
        viewBox="0 0 24 24"
        className="relative h-4 w-4 text-primary drop-shadow-[0_0_6px_rgba(0,243,255,0.7)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 6h4l3 8 3-8h4l-5 12h-4z" />
      </svg>
    </div>
  );
}
