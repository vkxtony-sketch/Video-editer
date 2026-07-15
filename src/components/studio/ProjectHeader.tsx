import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock3,
  Cpu,
  Download,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { formatTimestamp } from "@/lib/utils";

export default function ProjectHeader({
  title,
  durationSec,
  status,
  progress,
  summary,
  activeStage,
  persona,
  onRerun,
  onReset,
  demoMode,
  onExport,
}: {
  title: string;
  durationSec: number;
  status: "queued" | "processing" | "ready" | "failed";
  progress: number;
  summary?: string;
  activeStage: string;
  persona?: string;
  onRerun: () => void;
  onReset: () => void;
  demoMode: boolean;
  /** Real Export hook — receives the project meta. Defaults to a JSON EDL download. */
  onExport?: (edl: ExportArtifact) => void;
}) {
  const isProc = status === "processing";
  const isReady = status === "ready";

  function handleExport() {
    const artifact: ExportArtifact = {
      schema: "neon-edl/v1",
      generatedAt: new Date().toISOString(),
      project: { title, durationSec, status, persona, summary },
    };
    if (onExport) onExport(artifact);
    else defaultExportDownload(artifact);
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 px-5 py-4">
      <div className="min-w-0 flex-1">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Studio · projects
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="line-clamp-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {title}
          </h1>
          <Badge variant="outline" className="border-border/80 text-muted-foreground">
            <Clock3 className="mr-1 h-3 w-3" /> {formatTimestamp(durationSec)}
          </Badge>
          {persona && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              {persona}
            </Badge>
          )}
          {demoMode && (
            <Badge variant="outline" className="border-accent/40 text-accent">
              Demo · simulated pipeline
            </Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <span>{activeStage || (isReady ? "Idle" : "Starting…")}</span>
          </div>
          <div className="min-w-[180px] max-w-[320px] flex-1">
            <Progress value={progress} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {progress}%
          </span>
          {summary && (
            <span className="line-clamp-1 max-w-[420px] text-xs text-muted-foreground">
              {summary}
            </span>
          )}
          {isProc && (
            <motion.span
              className="ml-1 inline-block h-2 w-2 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onRerun} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> Re-run
        </Button>
        <Button variant="ghost" onClick={onReset} className="gap-1.5">
          <Trash2 className="h-4 w-4 text-destructive" /> Reset
        </Button>
        <Button
          disabled={!isReady}
          onClick={handleExport}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>
    </div>
  );
}

export type ExportArtifact = {
  schema: "neon-edl/v1";
  generatedAt: string;
  project: {
    title: string;
    durationSec: number;
    status: string;
    persona?: string;
    summary?: string;
  };
};

function defaultExportDownload(artifact: ExportArtifact) {
  const json = JSON.stringify(artifact, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = artifact.project.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "neon-edit";
  a.download = `${safe}.neon-edl.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
