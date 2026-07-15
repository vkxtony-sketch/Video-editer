import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Film, Play, ScanLine, Sparkles, Volume2 } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";

export type PreviewProps = {
  videoUrl?: string;
  persona?: string;
  durationSec: number;
  progress: number;
  activeStage: string;
  status: "queued" | "processing" | "ready" | "failed";
  scrubToSec: number | null;
};

function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m ? m[1] : null;
}

function isPlayableVideo(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith("blob:")) return true;
  return /\.(mp4|mov|webm|m4v|mkv|avi)(\?|$)/i.test(url);
}

export default function VideoPreview({
  videoUrl,
  persona,
  durationSec,
  progress,
  activeStage,
  status,
  scrubToSec,
}: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [tick, setTick] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, []);

  const yt = youtubeId(videoUrl);
  const playable = !yt && isPlayableVideo(videoUrl);
  const total = Math.max(durationSec, 60);
  const ratio = scrubToSec != null ? scrubToSec / total : 0;
  const playhead = Math.min(1, Math.max(0, ratio));

  function seekTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(total, sec));
    if (v.paused) void v.play().catch(() => {});
  }

  // When the parent asks us to scrub, jump the real video element.
  useEffect(() => {
    if (playable && scrubToSec != null) seekTo(scrubToSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubToSec, playable]);

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <Play className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">Preview</span>
          {playable && (
            <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent">
              Loaded source
            </span>
          )}
          {persona && (
            <span className="rounded border border-border/80 bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {persona}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span>{formatTimestamp(scrubToSec ?? 0)}</span>
          <span className="text-border">/</span>
          <span>{formatTimestamp(total)}</span>
        </div>
      </div>

      <div className="relative aspect-video w-full bg-[#04050a]">
        {yt ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${yt}?rel=0`}
            title="Source"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playable ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            src={videoUrl}
            controls
            preload="metadata"
            onPlay={() => setNowPlaying(true)}
            onPause={() => setNowPlaying(false)}
          />
        ) : (
          <PreviewCanvas
            progress={progress}
            activeStage={activeStage}
            status={status}
            tick={tick}
          />
        )}

        {status === "processing" && (
          <AnimatePresence>
            <motion.div
              key="scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_2px_rgba(0,243,255,0.6)] animate-scan" />
              <div className="absolute inset-0 scanlines opacity-50" />
              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded border border-primary/40 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-primary backdrop-blur">
                <ScanLine className="h-3 w-3" />
                {activeStage || "Initializing"}
              </div>
              <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded border border-accent/40 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-accent backdrop-blur">
                <Cpu className="h-3 w-3" />
                {Math.round(progress)}%
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {status === "ready" && (
          <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded border border-accent/40 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-accent backdrop-blur">
            <Sparkles className="h-3 w-3" /> Edit ready
          </div>
        )}

        {!playable && !yt && status === "ready" && (
          <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded border border-border/80 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
            <Film className="h-3 w-3" /> Drop a file or paste a URL to preview
          </div>
        )}

        {playable && nowPlaying && (
          <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded border border-accent/40 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-accent backdrop-blur">
            <Volume2 className="h-3 w-3" /> Playing source
          </div>
        )}

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1.5 bg-border/40">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_rgba(0,243,255,0.7)]"
            style={{ width: `${playhead * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewCanvas({
  progress,
  activeStage,
  status,
  tick,
}: {
  progress: number;
  activeStage: string;
  status: PreviewProps["status"];
  tick: number;
}) {
  const bars = 56;
  const band = status === "processing" ? Math.min(1, progress / 100) : 1;
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.06]" />
      <div className="absolute inset-0 border-grid opacity-25" />
      <div className="relative flex h-full w-full flex-col items-stretch justify-end gap-0 p-6">
        <div className="flex items-end gap-[2px]">
          {Array.from({ length: bars }).map((_, i) => {
            const seed = (i * 13 + tick * 7) % 100;
            const h = 18 + ((seed * 31) % 60);
            const onBar = status === "processing" && (i / bars) * 100 > (100 - progress);
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={`flex-1 rounded-sm transition-colors ${
                  onBar
                    ? "bg-gradient-to-t from-primary to-accent shadow-[0_0_6px_rgba(0,243,255,0.6)]"
                    : "bg-border/70"
                }`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <Volume2 className="h-3 w-3 text-primary" />
          {status === "processing"
            ? activeStage || "PIPELINE STARTING"
            : status === "ready"
              ? "AUDIO STREAM READY"
              : "AWAITING UPLOAD"}
          <span className="ml-auto font-mono normal-case tracking-normal text-primary/80">
            CHUNKS · {Math.round(band * 100)}% SCANNED
          </span>
        </div>
      </div>
    </div>
  );
}
