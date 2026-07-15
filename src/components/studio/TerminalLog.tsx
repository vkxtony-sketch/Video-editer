import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Terminal } from "lucide-react";

export type LogLine = {
  _id: string;
  stage: string;
  level: "info" | "warn" | "ok";
  message: string;
  ts: number;
};

export default function TerminalLog({
  logs,
  activeStage,
}: {
  logs: LogLine[];
  activeStage: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs.length]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-[#04050a]">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Terminal className="h-3.5 w-3.5" />
        </span>
        <span className="text-sm font-medium">AI Pipeline Log</span>
        <span className="ml-2 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.22em] text-accent">
          {activeStage || "Idle"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {logs.length} entries
        </span>
      </div>
      <div
        ref={ref}
        className="relative flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed"
      >
        <div className="pointer-events-none absolute inset-0 scanlines opacity-30" />
        {logs.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Awaiting first stage output…
          </p>
        )}
        <ul className="relative space-y-1">
          {logs.map((l, i) => (
            <motion.li
              key={l._id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex items-start gap-2 rounded px-2 py-1 ${
                i === logs.length - 1 ? "bg-primary/[0.06] text-glow-cyan" : ""
              }`}
            >
              <span className="text-muted-foreground">
                {new Date(l.ts).toISOString().slice(11, 19)}
              </span>
              <Level level={l.level} />
              <span className="text-border">·</span>
              <span className="text-muted-foreground">[{l.stage}]</span>
              <span className="flex-1">{l.message}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Level({ level }: { level: LogLine["level"] }) {
  if (level === "ok")
    return <span className="text-accent">✓ ok   </span>;
  if (level === "warn")
    return <span className="text-yellow-400">! warn </span>;
  return <span className="text-primary">→ info </span>;
}
