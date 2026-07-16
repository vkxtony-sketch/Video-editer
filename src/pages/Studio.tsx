import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import ProjectHeader, {
  type ExportArtifact,
} from "../components/studio/ProjectHeader";
import VideoPreview, {
  type VideoControlRef,
} from "../components/studio/VideoPreview";
import {
  renderHighlightReel,
  parseMp4BoxesFromBlob,
  BROWSER_RENDER_MAX_SEC,
} from "@/lib/ffmpeg";
import HighlightsList, {
  HighlightItem,
} from "../components/studio/HighlightsList";
import GeneratedTabs, {
  TitleItem,
  ThumbItem,
  CaptionItem,
} from "../components/studio/GeneratedTabs";
import TerminalLog, { LogLine } from "../components/studio/TerminalLog";
import TimelineStrip from "../components/studio/TimelineStrip";
import { Skeleton } from "../components/ui/skeleton";
import { detectSilenceFromUrl } from "@/lib/silenceDetect";
import { useStudioPrefs, type StudioTab } from "@/lib/useLocalStorage";
import {
  isTextFieldFocused,
  useStudioShortcuts,
  type ShortcutAction,
} from "@/lib/useShortcuts";
import {
  TAB_ORDER,
  buildUrlState,
  readUrlState,
} from "@/lib/urlStudioState";

function nextTab(tab: StudioTab): StudioTab {
  const i = TAB_ORDER.indexOf(tab);
  return TAB_ORDER[(i + 1) % TAB_ORDER.length];
}
function prevTab(tab: StudioTab): StudioTab {
  const i = TAB_ORDER.indexOf(tab);
  return TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length];
}

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const projectId = id as Id<"projects">;
  const project = useQuery(api.projects.get, { id: projectId });
  const logs = useQuery(api.queries.listLogs, { projectId });
  const clips = useQuery(api.queries.listClips, { projectId });
  const titles = useQuery(api.queries.listTitles, { projectId });
  const thumbs = useQuery(api.queries.listThumbnails, { projectId });
  const caps = useQuery(api.queries.listCaptions, { projectId });
  const runRow = useQuery(api.queries.latestRun, { projectId });
  const sceneMarks = useQuery(api.queries.listSceneMarks, { projectId });
  const run = useAction(api.pipeline.runPipeline);
  const appendCuts = useMutation(api.projects.appendCuts);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [scrubToSec, setScrubToSec] = useState<number | null>(null);
  const [startedOnce, setStartedOnce] = useState(false);
  const [audioScanRunning, setAudioScanRunning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const audioScanStartedRef = useRef<string | null>(null);
  const urlHydratedRef = useRef(false);

  // Persistent tab + highlight selection (per-project).
  const [prefs, setPrefs] = useStudioPrefs(projectId);

  // Imperative video control handle for keyboard shortcuts.
  const videoRef = useRef<VideoControlRef | null>(null);

  // Hydrate tab/highlight/scrub from the URL on first render — shareable
  // links win over the local-storage default.
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const u = readUrlState();
    if (u.tab) setPrefs({ tab: u.tab });
    if (u.highlightId) setPrefs({ highlightId: u.highlightId });
    if (u.scrubToSec != null) setScrubToSec(u.scrubToSec);
  }, [setPrefs]);

  // Restore last selected highlight when project loads (local-storage fallback
  // after URL hydration has had its turn).
  useEffect(() => {
    if (!project) return;
    if (!clips) return;
    if (prefs.highlightId && clips.some((c) => c._id === prefs.highlightId)) {
      setActiveClip(prefs.highlightId);
      const c = clips.find((x) => x._id === prefs.highlightId);
      if (c) setScrubToSec(Math.floor((c.startSec + c.endSec) / 2));
    }
    // intentionally only re-run when projectId or clips become available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?._id, clips === undefined]);

  // Sync {tab, highlightId, scrubToSec} to the URL via replaceState so it can
  // be shared without a router navigation.
  useEffect(() => {
    if (!project) return;
    const qs = buildUrlState({
      tab: prefs.tab,
      highlightId: activeClip,
      scrubToSec,
    });
    if (typeof window === "undefined") return;
    const next = `${window.location.pathname}${qs}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [project?._id, prefs.tab, activeClip, scrubToSec, project]);

  // Persist tab selection.
  const handleTabChange = useCallback(
    (v: StudioTab) => setPrefs({ tab: v }),
    [setPrefs],
  );

  // Persist highlight selection so it survives reload + cross-tab sync.
  const handleSelectHighlight = useCallback(
    (it: HighlightItem) => {
      setActiveClip(it._id);
      const mid = Math.floor((it.startSec + it.endSec) / 2);
      setScrubToSec(mid);
      setPrefs({ highlightId: it._id });
    },
    [setPrefs],
  );

  useEffect(() => {
    if (!project) return;
    const needsDemoRun =
      project.status === "queued" &&
      (project.source === "demo" ||
        project.source === "sample" ||
        project.source === "url");
    if (!startedOnce && needsDemoRun) {
      setStartedOnce(true);
      run({ projectId }).catch((e) => {
        toast.error("Pipeline failed to start", {
          description: e instanceof Error ? e.message : String(e),
        });
      });
    }
  }, [project?.status, project?.source, project, run, projectId, startedOnce]);

  // Real audio silence detection when a project is ready and playable.
  useEffect(() => {
    if (!project) return;
    if (project.status !== "ready") return;
    if (project.audioScanDone) return;
    if (!project.sourceUrl) return;
    if (audioScanStartedRef.current === projectId) return;
    if (audioScanRunning) return;
    audioScanStartedRef.current = projectId;
    setAudioScanRunning(true);
    (async () => {
      try {
        const cuts = await detectSilenceFromUrl(project.sourceUrl!);
        if (cuts.length > 0) {
          await appendCuts({ projectId, cuts });
        } else {
          await appendCuts({ projectId, cuts: [] });
        }
      } catch (e) {
        console.warn("audio scan failed", e);
        toast.error("Real audio scan failed", {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setAudioScanRunning(false);
      }
    })();
  }, [
    project?.status,
    project?.audioScanDone,
    project?.sourceUrl,
    projectId,
    appendCuts,
    audioScanRunning,
    project,
  ]);

  // Keyboard dispatch for studio shortcuts.
  const highlightItems = (clips ?? []).filter(
    (c) => c.kind === "highlight" || c.kind === "short",
  );
  const dispatchShortcut = useCallback(
    (a: ShortcutAction) => {
      switch (a.type) {
        case "toggle-play":
          videoRef.current?.togglePlay();
          break;
        case "seek": {
          const v = videoRef.current;
          if (v) {
            v.seekBy(a.deltaSec);
          } else {
            const next = (scrubToSec ?? 0) + a.deltaSec;
            setScrubToSec(Math.max(0, Math.min(project?.durationSec ?? 0, next)));
            setActiveClip(null);
          }
          break;
        }
        case "frame-step":
          videoRef.current?.stepFrame(a.direction);
          break;
        case "select-highlight": {
          const it = highlightItems[a.index];
          if (it) handleSelectHighlight(it);
          break;
        }
        case "mute":
          videoRef.current?.setMuted(null);
          break;
        case "fullscreen":
          void videoRef.current?.requestFullscreen();
          break;
        case "next-tab":
          setPrefs({ tab: nextTab(prefs.tab) });
          break;
        case "prev-tab":
          setPrefs({ tab: prevTab(prefs.tab) });
          break;
        case "reset-scrub":
          setScrubToSec(0);
          setActiveClip(null);
          videoRef.current?.seekTo(0);
          break;
      }
    },
    [highlightItems, handleSelectHighlight, prefs.tab, scrubToSec, project?.durationSec, setPrefs],
  );

  useStudioShortcuts(
    {
      highlightCount: highlightItems.length,
      isTextFieldFocused,
    },
    dispatchShortcut,
  );

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-10">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="mt-4 h-3 w-2/3" />
        <Skeleton className="mt-4 h-[400px] w-full" />
      </div>
    );
  }

  const derivedLogs: LogLine[] = logs ?? [];
  const derivedClips = clips ?? [];
  const derivedHighs: HighlightItem[] = highlightItems;
  const derivedTitles: TitleItem[] = titles ?? [];
  const derivedThumbs: ThumbItem[] = thumbs ?? [];
  const derivedCaps: CaptionItem[] = caps ?? [];
  const activeStage = audioScanRunning
    ? "Real audio silence scan · Web Audio API"
    : runRow?.activeStage ?? "";
  const activeClipObj = derivedHighs.find((c) => c._id === activeClip) ?? null;
  const nestedSceneMarks =
    sceneMarks?.map((m) => ({ tSec: m.tSec, distance: m.distance })) ?? [];

  const navigate = useNavigate();
  function reset() {
    navigate("/dashboard");
  }
  function rerun() {
    run({ projectId }).catch((e) => {
      toast.error("Pipeline re-run failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    });
  }

  // Real MP4 export via the browser-side FFmpeg.wasm renderer.
  // Falls back to the JSON EDL download when there is no source video,
  // no clip list yet, or the source is longer than the supported 2-hour
  // browser budget (server-side render is the path for >2 h VODs).
  const handleExport = useCallback(
    async (_artifact: ExportArtifact) => {
      // Double-click guard: while a render is in-flight, ignore the
      // extra project header click entirely (rather than re-queuing).
      if (isExporting) return;
      setIsExporting(true);
      try {
        const titleSafe =
        project.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "neon-reel";

      function downloadBlob(filename: string, blob: Blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function edlFallback() {
        downloadBlob(
          `${titleSafe}.neon-edl.json`,
          new Blob([JSON.stringify(_artifact, null, 2)], {
            type: "application/json",
          }),
        );
      }

      if (!project.sourceUrl) {
        toast.info("No source video to render — exporting JSON EDL", {
          description:
            "Upload or paste a video URL, then re-run the pipeline.",
        });
        edlFallback();
        return;
      }

      if (project.durationSec > BROWSER_RENDER_MAX_SEC) {
        toast.warning("Source over 2 h — browser export skipped", {
          description:
            "Exported JSON EDL instead. Server-side render unlocks >2 h VODs.",
        });
        edlFallback();
        return;
      }

      const candidates = (clips ?? [])
        .filter(
          (c) =>
            c.kind === "highlight" ||
            c.kind === "short" ||
            c.kind === "chapter",
        )
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 12);

      if (candidates.length === 0) {
        toast.info("No clips to render yet — exporting JSON EDL", {
          description:
            "Click Re-run to generate highlights, shorts, and chapters first.",
        });
        edlFallback();
        return;
      }

      const tId = toast.loading(
        `Rendering ${candidates.length}-clip reel (~${project.durationSec.toFixed(0)}s source · preset ${prefs.preset})… 0%`,
      );
      try {
        const sourceRes = await fetch(project.sourceUrl);
        if (!sourceRes.ok) {
          throw new Error(
            `Source fetch failed: ${sourceRes.status} ${sourceRes.statusText}`,
          );
        }
        const sourceBlob = await sourceRes.blob();

        const mp4 = await renderHighlightReel({
          videoBlob: sourceBlob,
          clips: candidates,
          onProgress: (r) =>
            toast.loading(`Rendering reel… ${Math.round(r * 100)}%`, {
              id: tId,
            }),
          preset: prefs.preset,
        });

        const validation = await parseMp4BoxesFromBlob(mp4);
        if (!validation.ok) {
          const missing = [
            validation.ftypAt < 0 ? "'ftyp'" : null,
            validation.moovAt < 0 ? "'moov'" : null,
          ]
            .filter(Boolean)
            .join(" and ");
          throw new Error(
            `Rendered file is not a valid MP4 — missing ${missing} box(es)`,
          );
        }

        downloadBlob(`${titleSafe}.neon-reel.mp4`, mp4);
        toast.success(
          `Exported ${(mp4.size / 1024 / 1024).toFixed(1)} MB highlight reel`,
          {
            id: tId,
            description: `${candidates.length} clips · mp4 · ${prefs.preset}`,
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("Export failed", { id: tId, description: msg });
      }
    } finally {
      setIsExporting(false);
    }
  },
  [project, clips, prefs.preset, isExporting],
  );

  return (
    <div className="mx-auto max-w-[1600px]">
      <ProjectHeader
        title={project.title}
        durationSec={project.durationSec}
        status={project.status}
        progress={project.progress}
        summary={project.summary}
        activeStage={activeStage}
        persona={project.persona}
        onRerun={rerun}
        onReset={reset}
        demoMode={project.source !== "upload"}
        source={project.source}
        audioCutCount={project.audioCutCount ?? 0}
        audioScanDone={project.audioScanDone ?? false}
        llmMode={runRow?.llmMode}
        llmProvider={runRow?.llmProvider ?? null}
        onExport={handleExport}
        preset={prefs.preset}
        onPresetChange={(p) => setPrefs({ preset: p })}
        exportDisabled={isExporting}
      />

      <div className="grid grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-12">
        {/* Video + Tabs (left, 12 → 8 cols) */}
        <div className="flex min-h-[420px] flex-col gap-3 lg:col-span-8">
          <div className="flex-[1.4] min-h-[260px]">
            <VideoPreview
              ref={videoRef}
              videoUrl={project.sourceUrl}
              persona={project.persona}
              durationSec={project.durationSec}
              progress={project.progress}
              activeStage={activeStage}
              status={project.status}
              scrubToSec={scrubToSec}
              onPlayChange={setIsPlaying}
            />
          </div>
          <div className="flex-[1] min-h-[220px] overflow-hidden rounded-xl border border-border/70 bg-card/60">
            <GeneratedTabs
              titles={derivedTitles}
              thumbnails={derivedThumbs}
              captions={derivedCaps}
              value={prefs.tab}
              onValueChange={(v) => handleTabChange(v as StudioTab)}
            />
          </div>
        </div>

        {/* Right column: highlights + terminal */}
        <div className="flex min-h-[420px] flex-col gap-3 lg:col-span-4">
          <div className="min-h-[260px] flex-[1.2]">
            <HighlightsList
              items={derivedHighs}
              activeId={activeClip}
              onSelect={handleSelectHighlight}
            />
          </div>
          <div className="min-h-[220px] flex-1">
            <TerminalLog logs={derivedLogs} activeStage={activeStage} />
          </div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <TimelineStrip
          durationSec={project.durationSec}
          clips={derivedClips}
          sceneMarks={nestedSceneMarks}
          activeClipId={activeClipObj?._id ?? null}
          scrubToSec={scrubToSec}
          isPlaying={isPlaying}
          onScrub={(s) => {
            setScrubToSec(s);
            setActiveClip(null);
            setPrefs({ highlightId: null });
          }}
        />
      </div>

      <ShortcutLegend highlightCount={derivedHighs.length} />
    </div>
  );
}

function ShortcutLegend({ highlightCount }: { highlightCount: number }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
    };
  }, []);
  function handleShare() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    if (!navigator.clipboard?.writeText) {
      toast.error("Clipboard unavailable", {
        description: "Your browser does not expose navigator.clipboard.",
      });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        if (copyTimer.current != null) window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e) => {
        toast.error("Could not copy link", {
          description: e instanceof Error ? e.message : String(e),
        });
      });
  }
  const keys: { keys: string; label: string }[] = [
    { keys: "Space / K", label: "Play / Pause" },
    { keys: "J / L", label: "Seek ±5s" },
    { keys: ", / .", label: "Frame step" },
    { keys: "← / →", label: "Seek ±5s" },
    { keys: "⇧ ← / →", label: "Seek ±30s" },
    { keys: "↑ / ↓", label: "Switch tab" },
    { keys: "M", label: "Mute" },
    { keys: "F", label: "Fullscreen" },
    { keys: "Home", label: "Reset scrub" },
  ];
  if (highlightCount > 0) {
    keys.push({ keys: "1 – 9", label: `Jump to highlight (${Math.min(9, highlightCount)})` });
  }
  return (
    <div
      data-testid="shortcut-legend"
      className="mx-3 mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
    >
      <span className="font-semibold text-foreground/80">Shortcuts</span>
      {keys.map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-border/80 bg-secondary/60 px-1.5 py-0.5 font-mono text-[9px] text-foreground/90">
            {k.keys}
          </kbd>
          <span>{k.label}</span>
        </span>
      ))}
      <button
        onClick={handleShare}
        data-testid="copy-share-link"
        data-copied={copied ? "true" : "false"}
        className={`ml-auto inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] transition ${
          copied
            ? "border-accent/60 bg-accent/15 text-accent"
            : "border-border/80 bg-secondary/60 text-foreground hover:border-accent/60 hover:text-accent"
        }`}
        title="Copy a shareable link to this exact view (tab + highlight + scrub position)"
      >
        {copied ? (
          <>
            <span className="font-mono text-[10px]" aria-hidden="true">✓</span>
            Copied
          </>
        ) : (
          <>
            <span className="font-mono" aria-hidden="true">⌘</span>
            Copy share link
          </>
        )}
      </button>
    </div>
  );
}
