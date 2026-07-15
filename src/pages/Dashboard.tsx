import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { motion } from "framer-motion";
import { Id } from "../../convex/_generated/dataModel";
import {
  Clapperboard,
  Clock3,
  Film,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Skeleton } from "../components/ui/skeleton";
import { useSession } from "../hooks/useSession";
import { formatTimestamp } from "../lib/utils";
import {
  analyzeAndIngest,
  type AnalysisProgress,
} from "../lib/pipelineClient";

const personas = [
  { key: "podcast", label: "Podcast · Multi-cam", dur: 90 * 60 },
  { key: "vlog", label: "Vlog · Daily", dur: 24 * 3600 },
  { key: "stream", label: "Livestream VOD", dur: 8 * 3600 },
  { key: "tutorial", label: "Tutorial/Course", dur: 3 * 3600 },
  { key: "product", label: "Product Demo", dur: 60 * 60 },
  { key: "interview", label: "Long Interview", dur: 5 * 3600 },
];

const STAGE_LABEL: Record<AnalysisProgress["stage"], string> = {
  "audio-decode": "Decoding audio",
  "audio-rms": "Measuring energy + silence",
  "video-sample": "Sampling frames + scene detection",
  "build-artifacts": "Scoring clips + drafting titles",
  ingest: "Saving results",
};

export default function Dashboard() {
  const ownerId = useSession();
  const projects = useQuery(
    api.projects.list,
    ownerId ? { ownerId } : "skip",
  );
  const remove = useMutation(api.projects.remove);
  const create = useMutation(api.projects.create);
  const ingestAnalysis = useMutation(api.analyze.ingestAnalysis);
  const ingestSceneMarks = useMutation(api.analyze.ingestSceneMarks);
  const generateNarrative = useAction(api.llm.generateNarrative);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState<{
    stage: AnalysisProgress["stage"];
    frac: number;
  } | null>(null);

  async function handleDelete(id: Id<"projects">) {
    await remove({ id });
  }

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types?.includes("Files")) return;
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await ingestFile(file);
  }

  async function ingestFile(file: File) {
    if (!ownerId) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name)) {
      alert("Please drop a video file (mp4, mov, webm, m4v, mkv).");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      alert(
        "File is over 500MB — the in-browser pipeline caps at 500MB. For huge VODs, please link directly to the stream source (URL source).",
      );
      return;
    }

    setAnalyzing({ stage: "audio-decode", frac: 0 });
    const url = URL.createObjectURL(file);
    const probedDuration = await probeDuration(url).catch(() => 0);
    const minutes = Math.max(1, Math.round(file.size / (1024 * 1024)));
    const title = file.name.replace(/\.[^.]+$/, "") || "Untitled upload";
    const durationSec = Math.max(60, Math.floor(probedDuration || minutes * 60));

    const { projectId } = await create({
      ownerId,
      title,
      source: "upload",
      sourceUrl: url,
      sourceLabel: `${file.name} · ${minutes}MB`,
      durationSec,
      sizeMb: minutes,
      persona: "user upload",
    });

    try {
      await analyzeAndIngest({
        file,
        projectId,
        title,
        persona: "user upload",
        ownerId,
        ingest: async (artifacts) => {
          await ingestAnalysis({
            projectId: projectId as Id<"projects">,
            clips: artifacts.clips,
            titles: artifacts.titles,
            thumbnails: artifacts.thumbnails,
            captions: artifacts.captions,
            metrics: artifacts.metrics,
          });
          // Persist scene-change markers for the TimelineStrip dashed lines.
          if (artifacts.metrics.scenes.length > 0) {
            await ingestSceneMarks({
              projectId: projectId as Id<"projects">,
              marks: artifacts.metrics.scenes,
            });
          }
        },
        // Optional LLM narrative overlay. Runs server-side via Groq when
        // GROQ_API_KEY is set; gracefully falls back to deterministic on any
        // error or missing key.
        llmOverrides: async () => {
          try {
            const r = await generateNarrative({
              title,
              persona: "user upload",
              durationSec,
              scenesDetected: 0, // updated below from real metrics
              silencesCount: 0,
              peakRms: 0,
              meanRms: 0,
            });
            // The metrics fields above are placeholders; we only need the LLM
            // override to inject titles + headlines. Detailed metrics are
            // already interpolated by `analyzeAndIngest` itself.
            void r;
            return { titles: null, headlines: null };
          } catch (e) {
            console.warn("LLM overlay (upload flow) failed:", e);
            return { titles: null, headlines: null };
          }
        },
        onProgress: (p) => setAnalyzing({ stage: p.stage, frac: p.frac }),
      });
      navigate(`/studio/${projectId}`);
    } catch (err) {
      console.error(err);
      alert("Real analysis failed — falling back to demo. " + String(err));
      // navigate anyway; studio will show pipeline-runner for that project
      navigate(`/studio/${projectId}`);
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <div
      className="relative mx-auto max-w-7xl px-5 py-10"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-4 z-50 grid place-items-center rounded-3xl border-2 border-dashed border-primary bg-primary/[0.06] backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="h-10 w-10" />
            <p className="text-sm font-medium">
              Drop a video to spin up a project · real analysis runs in your
              browser
            </p>
          </div>
        </div>
      )}

      {analyzing && (
        <AnalyzingOverlay
          stage={analyzing.stage}
          frac={analyzing.frac}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="grid h-5 w-5 place-items-center rounded border border-primary/40 bg-primary/10 text-primary">
              <Clapperboard className="h-3 w-3" />
            </span>
            Studio
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            <span className="gradient-text-neon">Projects</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop a video anywhere on this page — the browser runs real Web
            Audio + frame-hash analysis to find highlights, cuts, and chapters.
            For huge VODs, point us at the URL.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewProjectDialog open={open} setOpen={setOpen} onFile={ingestFile} />
        </div>
      </div>

      <div className="mt-8">
        {projects === undefined ? (
          <GridSkeleton />
        ) : projects.length === 0 ? (
          <EmptyState onPick={(f) => ingestFile(f)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <motion.div
                key={p._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
              >
              <ProjectCard
                id={p._id}
                title={p.title}
                durationSec={p.durationSec}
                status={p.status}
                progress={p.progress}
                summary={p.summary}
                persona={p.persona}
                source={p.source}
                coverThumb={p.coverThumb ?? null}
                onOpen={() => navigate(`/studio/${p._id}`)}
                onDelete={() => handleDelete(p._id)}
              />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyzingOverlay({
  stage,
  frac,
}: {
  stage: AnalysisProgress["stage"];
  frac: number;
}) {
  return (
    <div
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur"
    >
      <div className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6 shadow-[0_0_60px_-15px_rgba(0,243,255,0.6)]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="text-sm font-medium">{STAGE_LABEL[stage]}</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all"
            style={{ width: `${Math.round(frac * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Running real Web Audio + frame-hash analysis in your browser. No
          data leaves your device.
        </p>
      </div>
    </div>
  );
}

function ProjectCard({
  id,
  title,
  durationSec,
  status,
  progress,
  summary,
  persona,
  source,
  coverThumb,
  onOpen,
  onDelete,
}: {
  id: Id<"projects">;
  title: string;
  durationSec: number;
  status: "queued" | "processing" | "ready" | "failed";
  progress: number;
  summary?: string;
  persona?: string;
  source?: "upload" | "url" | "demo" | "sample";
  coverThumb?: { headline: string; imageDataUrl: string } | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const statusMeta = {
    queued: { c: "bg-muted text-muted-foreground", l: "Queued" },
    processing: { c: "bg-primary/15 text-primary", l: "Processing" },
    ready: { c: "bg-accent/15 text-accent", l: "Ready" },
    failed: { c: "bg-destructive/15 text-destructive", l: "Failed" },
  } as const;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur transition hover:border-primary/40 hover:shadow-[0_0_40px_-20px_rgba(0,243,255,0.7)]">
      {/* Real cover thumbnail if one was captured during analysis. */}
      {coverThumb?.imageDataUrl && (
        <div className="relative aspect-video w-full overflow-hidden border-b border-border/60 bg-[#06070d]">
          <img
            src={coverThumb.imageDataUrl}
            alt={coverThumb.headline || title}
            loading="lazy"
            data-testid="project-cover"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded border border-accent/40 bg-background/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.22em] text-accent backdrop-blur">
            Real frame
          </span>
        </div>
      )}
      <button onClick={onOpen} className="block w-full p-5 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-1 text-base font-semibold tracking-tight">
              {title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" /> {formatTimestamp(durationSec)}
              </span>
              {persona && (
                <span className="inline-flex items-center gap-1 rounded border border-border/80 bg-secondary/60 px-1.5 py-0.5">
                  {persona}
                </span>
              )}
              {source === "upload" && (
                <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent">
                  Real upload
                </span>
              )}
            </div>
          </div>
          <Badge className={statusMeta[status].c}>{statusMeta[status].l}</Badge>
        </div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{status === "ready" ? "Pipeline complete" : `${progress || 0}%`}</span>
            <span className="font-mono">{formatTimestamp(0)}</span>
          </div>
          <Progress value={progress || (status === "ready" ? 100 : 4)} />
          {summary && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-border/60 px-5 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {id.slice(-6).toUpperCase()}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-10 text-center">
      <div className="mx-auto inline-grid h-12 w-12 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
        <Film className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Drag a video anywhere on this page, or click the button to pick one.
        The browser runs Web Audio + frame-hash analysis to find highlights.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Button
        className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" /> Pick a video file
      </Button>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/70 bg-card/60 p-5"
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <Skeleton className="mt-5 h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

function NewProjectDialog({
  open,
  setOpen,
  onFile,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onFile: (f: File) => void;
}) {
  const ownerId = useSession();
  const create = useMutation(api.projects.create);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [personaKey, setPersonaKey] = useState(personas[0].key);
  const [title, setTitle] = useState("");
  const [sourceKind, setSourceKind] = useState<"url" | "upload" | "demo">(
    "demo",
  );
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function startRun() {
    if (!ownerId) return;
    setBusy(true);
    try {
      const persona = personas.find((p) => p.key === personaKey);
      const finalTitle =
        title.trim() ||
        `${persona?.label || "Untitled"} · ${new Date().toLocaleString()}`;
      const { projectId } = await create({
        ownerId,
        title: finalTitle,
        source: sourceKind,
        sourceUrl: sourceKind === "url" ? sourceUrl : undefined,
        sourceLabel:
          sourceKind === "demo"
            ? "Demo source · no file"
            : sourceKind === "url"
              ? sourceUrl
              : "Uploaded",
        durationSec: persona?.dur || 60 * 60,
        persona: persona?.label,
      });
      setOpen(false);
      navigate(`/studio/${projectId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/80 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            New pipeline run
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div>
            <Label>Title</Label>
            <Input
              placeholder="e.g. Monday stream · 12h VOD"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <Label>Persona</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {personas.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPersonaKey(p.key)}
                  className={`group flex flex-col items-start rounded-lg border px-3 py-2.5 text-left text-xs transition ${
                    personaKey === p.key
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border/70 bg-secondary/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {formatTimestamp(p.dur)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Source</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { k: "demo", l: "Demo source", i: Sparkles },
                  { k: "url", l: "Video URL", i: Upload },
                  { k: "upload", l: "Upload", i: Video },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setSourceKind(opt.k)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition ${
                    sourceKind === opt.k
                      ? "border-accent/60 bg-accent/10 text-foreground"
                      : "border-border/70 bg-secondary/40 text-muted-foreground hover:border-border"
                  }`}
                >
                  <opt.i className="h-3.5 w-3.5" />
                  {opt.l}
                </button>
              ))}
            </div>
            {sourceKind === "url" && (
              <Input
                placeholder="https://youtube.com/watch?v=… or https://…/file.mp4"
                className="mt-2"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            )}
            {sourceKind === "upload" && (
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setOpen(false);
                      onFile(f);
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="block w-full rounded-lg border border-dashed border-border/70 bg-secondary/30 p-4 text-center text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <Upload className="mx-auto h-4 w-4" />
                  Click to pick a video file · runs real Web Audio + frame
                  analysis locally · up to 500MB
                </button>
              </div>
            )}
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Anything you want the pipeline to focus on? Hook detection? Specific topics?"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Demo and URL sources use the bundled mock pipeline. Uploaded
              files run real analysis in your browser.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={startRun}
                disabled={busy || !ownerId}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Start pipeline
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </div>
  );
}

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.src = url;
    const cleanup = () => {
      v.removeAttribute("src");
      v.load();
    };
    v.onloadedmetadata = () => {
      const d = isFinite(v.duration) ? v.duration : 0;
      cleanup();
      resolve(d);
    };
    v.onerror = () => {
      cleanup();
      resolve(0);
    };
    setTimeout(() => {
      cleanup();
      resolve(0);
    }, 4000);
  });
}
