import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Film,
  Pause,
  Play,
  ScanLine,
  Sparkles,
  Volume2,
} from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import {
  computeWaveformFromUrl,
  drawWaveform,
  type Waveform,
} from "@/lib/waveform";

export type VideoControlRef = {
  /** Toggle play/pause of the underlying video element. */
  togglePlay: () => void;
  /** Pause playback (no-op if already paused). */
  pause: () => void;
  /** Play (no-op if already playing). */
  play: () => void;
  /** Seek by a signed delta in seconds. Clamped to [0, duration]. */
  seekBy: (deltaSec: number) => void;
  /** Seek to an absolute second. Clamped to [0, duration]. */
  seekTo: (sec: number) => void;
  /** Mute / unmute. Pass `null` to toggle. */
  setMuted: (muted: boolean | null) => void;
  /** Best-effort fullscreen on the video element. */
  requestFullscreen: () => Promise<void>;
  /** Set playback rate (e.g. 0.25, 0.5, 1, 1.5, 2). */
  setPlaybackRate: (rate: number) => void;
  /** Step a single video frame. `frames` defaults to +1, pass negative to step back. */
  stepFrame: (frames?: number) => void;
  /** Returns the current playback time in seconds. */
  currentTime: () => number;
  /** Returns the total duration. */
  duration: () => number;
  /** Returns whether the video is currently playing. */
  isPlaying: () => boolean;
};

export type PreviewProps = {
  videoUrl?: string;
  persona?: string;
  durationSec: number;
  progress: number;
  activeStage: string;
  status: "queued" | "processing" | "ready" | "failed";
  scrubToSec: number | null;
  /** Notifies parent so downstream UI (TimelineStrip) can pulse the playhead. */
  onPlayChange?: (playing: boolean) => void;
  /** Imperative playback-speed setter; optional. */
  initialPlaybackRate?: number;
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

const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const;
const FRAME_STEP_SEC = 1 / 30; // assume ~30fps; close enough for a step button

const VideoPreview = forwardRef<VideoControlRef, PreviewProps>(function VideoPreview(
  {
    videoUrl,
    persona,
    durationSec,
    progress,
    activeStage,
    status,
    scrubToSec,
    onPlayChange,
    initialPlaybackRate,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(false);
  const [muted, setMuted] = useState(true); // start muted; user can press M
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState<Waveform | null>(null);
  const [playbackRate, setPlaybackRate] = useState(
    initialPlaybackRate ?? 1,
  );
  const [pausedFlash, setPausedFlash] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, []);

  // Bubble playback state up to the parent for the TimelineStrip pulse.
  useEffect(() => {
    onPlayChange?.(nowPlaying);
  }, [nowPlaying, onPlayChange]);

  // Apply playback rate changes to the <video> element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate]);

  const yt = youtubeId(videoUrl);
  const playable = !yt && isPlayableVideo(videoUrl);
  const total = Math.max(durationSec, 60);
  const ratio = scrubToSec != null ? scrubToSec / total : 0;
  const playhead = Math.min(1, Math.max(0, ratio));

  // Decoded + downsampled waveform for the playable media. Runs once per
  // videoUrl change. Silent failure → no canvas render.
  useEffect(() => {
    if (!playable || !videoUrl) {
      setWaveform(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const wf = await computeWaveformFromUrl(videoUrl, 256);
      if (!cancelled) setWaveform(wf);
    })();
    return () => {
      cancelled = true;
    };
  }, [playable, videoUrl]);

  // Poll currentTime so the waveform playhead + scanline follow playback.
  useEffect(() => {
    if (!playable) return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (v) setCurrentTime(v.currentTime);
    }, 100);
    return () => window.clearInterval(id);
  }, [playable]);

  // Redraw the waveform canvas when peaks, playhead ratio, or width changes.
  useEffect(() => {
    if (!waveform || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ratio =
      waveform.durationSec > 0
        ? Math.min(1, Math.max(0, currentTime / waveform.durationSec))
        : 0;
    drawWaveform(ctx, waveform.peaks, rect.width, rect.height, ratio);
  }, [waveform, currentTime, tick]);

  // Scrub-to helper driven by parent state.
  function seekTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(total, sec));
    v.currentTime = clamped;
  }

  useEffect(() => {
    if (playable && scrubToSec != null) seekTo(scrubToSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubToSec, playable]);

  function stepFrameLocal(frames: number = 1) {
    const v = videoRef.current;
    if (!v) return;
    const next = Math.max(
      0,
      Math.min(total, v.currentTime + frames * FRAME_STEP_SEC),
    );
    v.currentTime = next;
    setCurrentTime(next);
    setPausedFlash(true);
    window.setTimeout(() => setPausedFlash(false), 600);
  }

  // Expose imperative video controls to the parent for keyboard shortcuts.
  useImperativeHandle(
    ref,
    (): VideoControlRef => ({
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) void v.play().catch(() => {});
        else v.pause();
      },
      play: () => {
        const v = videoRef.current;
        if (!v) return;
        void v.play().catch(() => {});
      },
      pause: () => {
        const v = videoRef.current;
        if (!v) return;
        v.pause();
      },
      seekBy: (delta) => {
        const v = videoRef.current;
        if (!v) return;
        const next = Math.max(0, Math.min(total, v.currentTime + delta));
        v.currentTime = next;
        setCurrentTime(next);
      },
      seekTo: (sec) => {
        seekTo(sec);
        setCurrentTime(sec);
      },
      setMuted: (m) => {
        const v = videoRef.current;
        if (!v) return;
        const next = m === null ? !v.muted : m;
        v.muted = next;
        setMuted(next);
      },
      requestFullscreen: async () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.requestFullscreen) await v.requestFullscreen();
      },
      setPlaybackRate: (rate) => {
        setPlaybackRate(rate);
      },
      stepFrame: (frames = 1) => stepFrameLocal(frames),
      currentTime: () => videoRef.current?.currentTime ?? 0,
      duration: () => videoRef.current?.duration ?? 0,
      isPlaying: () => !videoRef.current?.paused,
    }),
    [total],
  );

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }

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
          <span>{formatTimestamp(playable ? currentTime : scrubToSec ?? 0)}</span>
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
            muted={muted}
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

        {/* Waveform canvas — only meaningful when an audio source is loaded.
            Positioned above the playback-controls strip so they never overlap. */}
        {playable && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24">
            <canvas
              ref={canvasRef}
              className="block h-12 w-full"
              data-testid="waveform-canvas"
            />
          </div>
        )}

        {/* Playback control row. Hidden behind a faint glass panel. */}
        {playable && (
          <div
            data-testid="playback-controls"
            className="absolute bottom-12 left-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] backdrop-blur"
          >
            <button
              onClick={togglePlay}
              data-testid="play-toggle"
              className="grid h-7 w-7 place-items-center rounded border border-primary/40 bg-primary/10 text-primary transition hover:border-primary/60 hover:bg-primary/20"
              aria-label={nowPlaying ? "Pause" : "Play"}
            >
              {nowPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => stepFrameLocal(-1)}
              data-testid="frame-back"
              className="grid h-7 w-7 place-items-center rounded border border-border/80 bg-secondary/60 text-foreground transition hover:border-accent/60 hover:text-accent"
              aria-label="Previous frame"
              title="Previous frame (,)"
            >
              <span className="font-mono text-[10px]">⟨|</span>
            </button>
            <button
              onClick={() => stepFrameLocal(1)}
              data-testid="frame-forward"
              className="grid h-7 w-7 place-items-center rounded border border-border/80 bg-secondary/60 text-foreground transition hover:border-accent/60 hover:text-accent"
              aria-label="Next frame"
              title="Next frame (.)"
            >
              <span className="font-mono text-[10px]">|⟩</span>
            </button>
            <div className="mx-1 h-4 w-px bg-border/60" />
            <span className="font-mono text-[9px] text-muted-foreground">Speed</span>
            {SPEED_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setPlaybackRate(r)}
                data-testid={`speed-${r}`}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                  Math.abs(playbackRate - r) < 1e-3
                    ? "border-accent/70 bg-accent/15 text-accent"
                    : "border-border/80 bg-secondary/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
                aria-pressed={Math.abs(playbackRate - r) < 1e-3}
                title={`${r}× playback`}
              >
                {r}×
              </button>
            ))}
          </div>
        )}

        {pausedFlash && playable && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-accent backdrop-blur">
              Frame step
            </div>
          </div>
        )}

        {/* Playback progress bar overlays the bottom of the playable area. */}
        {playable && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1 bg-border/40">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_rgba(0,243,255,0.7)]"
              style={{
                width: `${Math.min(100, Math.max(0, (currentTime / total) * 100))}%`,
              }}
            />
          </div>
        )}
        {!playable && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1.5 bg-border/40">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_rgba(0,243,255,0.7)]"
              style={{ width: `${playhead * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default VideoPreview;

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
            const onBar =
              status === "processing" && (i / bars) * 100 > (100 - progress);
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
