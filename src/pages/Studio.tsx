import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import ProjectHeader from "../components/studio/ProjectHeader";
import VideoPreview from "../components/studio/VideoPreview";
import HighlightsList, {
  HighlightItem,
} from "../components/studio/HighlightsList";
import GeneratedTabs, {
  TitleItem,
  ThumbItem,
  CaptionItem,
} from "../components/studio/GeneratedTabs";
import TerminalLog, { LogLine } from "../components/studio/TerminalLog";
import TimelineStrip, { TimelineClip } from "../components/studio/TimelineStrip";
import { Skeleton } from "../components/ui/skeleton";

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
  const run = useAction(api.pipeline.runPipeline);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [scrubToSec, setScrubToSec] = useState<number | null>(null);
  const [startedOnce, setStartedOnce] = useState(false);

  useEffect(() => {
    if (!project) return;
    if (!startedOnce && project.status === "queued") {
      setStartedOnce(true);
      run({ projectId }).catch(() => {});
    }
  }, [project?.status, project, run, projectId, startedOnce]);

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
  const derivedClips: TimelineClip[] = clips ?? [];
  const derivedHighs: HighlightItem[] = (clips ?? []).filter(
    (c) => c.kind === "highlight" || c.kind === "short",
  );
  const derivedTitles: TitleItem[] = titles ?? [];
  const derivedThumbs: ThumbItem[] = thumbs ?? [];
  const derivedCaps: CaptionItem[] = caps ?? [];
  const activeStage = runRow?.activeStage ?? "";
  const activeClipObj = derivedHighs.find((c) => c._id === activeClip) ?? null;

  const navigate = useNavigate();
  function reset() {
    navigate("/dashboard");
  }
  function rerun() {
    run({ projectId }).catch(() => {});
  }
  function selectClip(c: HighlightItem) {
    setActiveClip(c._id);
    setScrubToSec(Math.floor((c.startSec + c.endSec) / 2));
  }

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
        demoMode={true}
      />

      <div className="grid grid-cols-1 gap-3 px-3 py-3 lg:grid-cols-12">
        {/* Video + Tabs (left, 12 → 8 cols) */}
        <div className="flex min-h-[420px] flex-col gap-3 lg:col-span-8">
          <div className="flex-[1.4] min-h-[260px]">
            <VideoPreview
              videoUrl={project.sourceUrl}
              persona={project.persona}
              durationSec={project.durationSec}
              progress={project.progress}
              activeStage={activeStage}
              status={project.status}
              scrubToSec={scrubToSec}
            />
          </div>
          <div className="flex-[1] min-h-[220px] overflow-hidden rounded-xl border border-border/70 bg-card/60">
            <GeneratedTabs
              titles={derivedTitles}
              thumbnails={derivedThumbs}
              captions={derivedCaps}
            />
          </div>
        </div>

        {/* Right column: highlights + terminal */}
        <div className="flex min-h-[420px] flex-col gap-3 lg:col-span-4">
          <div className="min-h-[260px] flex-[1.2]">
            <HighlightsList
              items={derivedHighs}
              activeId={activeClip}
              onSelect={selectClip}
            />
          </div>
          <div className="min-h-[220px] flex-1">
            <TerminalLog logs={derivedLogs} activeStage={activeStage} />
          </div>
        </div>
      </div>

      <div className="px-3 pb-4">
        <TimelineStrip
          durationSec={project.durationSec}
          clips={derivedClips}
          activeClipId={activeClipObj?._id ?? null}
          scrubToSec={scrubToSec}
          onScrub={(s) => {
            setScrubToSec(s);
            setActiveClip(null);
          }}
        />
      </div>
    </div>
  );
}
