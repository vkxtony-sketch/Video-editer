import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Scissors } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type TimelineClip = {
  _id: Id<"clips">;
  kind: "highlight" | "short" | "chapter" | "cut";
  title: string;
  startSec: number;
  endSec: number;
  score: number;
  tags: string[];
};

export type SceneMark = {
  tSec: number;
  distance: number;
};

export default function TimelineStrip({
  durationSec,
  clips,
  sceneMarks,
  activeClipId,
  scrubToSec,
  isPlaying,
  onScrub,
}: {
  durationSec: number;
  clips: TimelineClip[];
  sceneMarks?: SceneMark[];
  activeClipId: string | null;
  scrubToSec: number | null;
  /** When true, animate the playhead with a subtle pulse. */
  isPlaying?: boolean;
  onScrub: (sec: number) => void;
}) {
  const total = Math.max(durationSec, 60);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [ticks, setTicks] = useState(12);
  useEffect(() => {
    function update() {
      if (!trackRef.current) return;
      const w = trackRef.current.clientWidth;
      const pxPerSec = w / total;
      const ideal = Math.min(48, Math.max(8, Math.floor(pxPerSec / 6)));
      setTicks(ideal);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [total]);

  function handle(e: React.MouseEvent) {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onScrub(Math.floor(ratio * total));
  }

  const playhead =
    scrubToSec != null ? Math.min(1, Math.max(0, scrubToSec / total)) : 0;

  return (
    <div className="rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <Scissors className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">Timeline</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span>0:00:00</span>
          <span className="text-border">—</span>
          <span>{formatTimestamp(total)}</span>
          <span className="rounded border border-border/80 bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.22em]">
            {clips.length} clips
          </span>
        </div>
      </div>
      <div className="relative p-3">
        <div
          ref={trackRef}
          onClick={handle}
          className="relative h-28 w-full cursor-pointer select-none overflow-hidden rounded-lg border border-border/60 bg-[#06070d]"
        >
          <div className="absolute inset-0 border-grid opacity-20" />
          {/* hour tick marks */}
          <div className="absolute inset-0">
            {Array.from({ length: ticks }).map((_, i) => {
              const left = (i / Math.max(1, ticks - 1)) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-border/60"
                  style={{ left: `${left}%` }}
                >
                  <span className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-muted-foreground">
                    {(total / Math.max(1, ticks - 1)) * i >= 3600
                      ? `${(total / Math.max(1, ticks - 1) / 3600 * i).toFixed(0)}h`
                      : `${Math.round((total / Math.max(1, ticks - 1)) / 60 * i)}m`}
                  </span>
                </div>
              );
            })}
          </div>
          {/* overlays by kind */}
          {clips
            .filter((c) => c.kind !== "cut")
            .map((c) => {
              const left = (c.startSec / total) * 100;
              const width =
                Math.max(0.6, ((c.endSec - c.startSec) / total) * 100);
              const color =
                c.kind === "highlight"
                  ? "bg-primary/35 border-primary/70"
                  : c.kind === "short"
                    ? "bg-accent/40 border-accent/70"
                    : "bg-secondary/60 border-border";
              const isActive = activeClipId === c._id;
              return (
                <motion.button
                  key={c._id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onScrub(Math.floor((c.startSec + c.endSec) / 2));
                  }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    boxShadow: isActive
                      ? "0 0 0 1px rgba(255,43,214,0.7), 0 0 14px rgba(255,43,214,0.4)"
                      : "0 0 0 1px rgba(255,255,255,0.06)",
                  }}
                  transition={{ duration: 0.25 }}
                  className={`absolute top-7 h-7 overflow-hidden rounded border ${color} text-[9px] text-foreground/90`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={c.title}
                >
                  <span className="block truncate px-1.5 py-0.5 font-medium">
                    {c.title}
                  </span>
                </motion.button>
              );
            })}
          {/* cut markers */}
          {clips
            .filter((c) => c.kind === "cut")
            .map((c) => {
              const left = (c.startSec / total) * 100;
              return (
                <div
                  key={c._id}
                  className="absolute bottom-0 h-2.5 w-0.5 bg-destructive/80 shadow-[0_0_6px_rgba(255,80,80,0.6)]"
                  style={{ left: `${left}%` }}
                  title={`Cut · ${formatTimestamp(c.startSec)} → ${formatTimestamp(c.endSec)}`}
                />
              );
            })}
          {/* scene-change markers (from frame-hash analysis) */}
          {sceneMarks?.map((m, i) => {
            const left = (m.tSec / total) * 100;
            const intensity = Math.min(1, Math.max(0, (m.distance - 10) / 30));
            return (
              <div
                key={`scene-${i}-${m.tSec}`}
                className="pointer-events-none absolute inset-y-2 w-px"
                style={{
                  left: `${left}%`,
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(255,255,255,0.55) 50%, transparent 50%)",
                  backgroundSize: "1px 4px",
                  opacity: 0.4 + intensity * 0.5,
                  boxShadow:
                    intensity > 0.5
                      ? "0 0 4px rgba(255,255,255,0.45)"
                      : undefined,
                }}
                title={`Scene change at ${formatTimestamp(m.tSec)} · distance ${m.distance}/64`}
                data-testid="scene-marker"
              />
            );
          })}
          {/* playhead — pulses when source is actively playing. */}
          <div
            className={`pointer-events-none absolute top-0 h-full w-px bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.8)] ${
              isPlaying ? "animate-pulse-soft" : ""
            }`}
            data-testid="timeline-playhead"
            style={{ left: `${playhead * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>Click to scrub · drag to inspect</span>
          <span>
            Highlight <span className="ml-2 inline-block h-1.5 w-3 rounded bg-primary/60 align-middle" />
            Shorts <span className="ml-2 inline-block h-1.5 w-3 rounded bg-accent/60 align-middle" />
            Auto-cut <span className="ml-2 inline-block h-1.5 w-1 rounded bg-destructive/80 align-middle" />
          </span>
        </div>
      </div>
    </div>
  );
}
