// Convex mutation for ingesting client-computed pipeline artifacts. The
// client-side `pipelineClient.ts` runs real Web Audio + frame-hash analysis
// in the browser, then POSTs the resulting artifacts here in a single batch.

import { v } from "convex/values";
import { mutation } from "./_generated/server";

const ClipShape = v.object({
  projectId: v.id("projects"),
  kind: v.union(
    v.literal("highlight"),
    v.literal("short"),
    v.literal("chapter"),
    v.literal("cut"),
  ),
  title: v.string(),
  startSec: v.number(),
  endSec: v.number(),
  score: v.number(),
  rationale: v.string(),
  tags: v.array(v.string()),
  createdAt: v.number(),
});

const TitleShape = v.object({
  projectId: v.id("projects"),
  label: v.string(),
  body: v.string(),
  score: v.number(),
  style: v.string(),
});

const ThumbShape = v.object({
  projectId: v.id("projects"),
  headline: v.string(),
  subtext: v.string(),
  palette: v.string(),
  score: v.number(),
});

const CaptionShape = v.object({
  projectId: v.id("projects"),
  startSec: v.number(),
  endSec: v.number(),
  speaker: v.string(),
  text: v.string(),
  sentiment: v.string(),
});

const SilencesShape = v.array(
  v.object({
    startSec: v.number(),
    endSec: v.number(),
    kind: v.union(v.literal("dead"), v.literal("filler")),
  }),
);

const MetricsShape = v.object({
  durationSec: v.number(),
  scenesDetected: v.number(),
  silences: SilencesShape,
  peakRms: v.number(),
  meanRms: v.number(),
  avgSceneDistance: v.number(),
});

export const ingestAnalysis = mutation({
  args: {
    projectId: v.id("projects"),
    clips: v.array(ClipShape),
    titles: v.array(TitleShape),
    thumbnails: v.array(ThumbShape),
    captions: v.array(CaptionShape),
    metrics: MetricsShape,
  },
  handler: async (ctx, args) => {
    // Idempotent: clear prior artifacts for this project.
    const priorClips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const c of priorClips) await ctx.db.delete(c._id);
    const priorTitles = await ctx.db
      .query("titles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const t of priorTitles) await ctx.db.delete(t._id);
    const priorThumbs = await ctx.db
      .query("thumbnails")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const t of priorThumbs) await ctx.db.delete(t._id);
    const priorCaps = await ctx.db
      .query("captions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const c of priorCaps) await ctx.db.delete(c._id);

    // Insert fresh artifacts.
    for (const c of args.clips) await ctx.db.insert("clips", c);
    for (const t of args.titles) await ctx.db.insert("titles", t);
    for (const t of args.thumbnails) await ctx.db.insert("thumbnails", t);
    for (const c of args.captions) await ctx.db.insert("captions", c);

    // Mark a finished run so the Studio's `latestRun` query still resolves.
    const startedAt = Date.now();
    const runId = await ctx.db.insert("pipelineRuns", {
      projectId: args.projectId,
      startedAt,
      finishedAt: Date.now(),
      activeStage: "Real analysis complete",
      overallProgress: 100,
      demoMode: false,
    });
    await ctx.db.insert("pipelineLogs", {
      projectId: args.projectId,
      runId,
      stage: "analyze",
      level: "ok",
      message: `✓ ${args.clips.length} highlights · ${args.captions.length} captions · ${args.thumbnails.length} thumbnails · ${args.metrics.scenesDetected} scenes detected · ${args.metrics.silences.length} silences`,
      ts: Date.now(),
    });

    const durationSec = args.metrics.durationSec;
    const durationLabel =
      durationSec >= 3600
        ? `${Math.round(durationSec / 3600)}-hour`
        : `${Math.round(durationSec / 60)}-minute`;
    const summary =
      `${durationLabel} recording · ${args.clips.filter((c) => c.kind === "highlight").length} highlights · ` +
      `${args.clips.filter((c) => c.kind === "short").length} shorts · ` +
      `${args.clips.filter((c) => c.kind === "chapter").length} chapters · ` +
      `${args.clips.filter((c) => c.kind === "cut").length} auto-cuts · ` +
      `peak RMS ${(args.metrics.peakRms * 100).toFixed(0)}%`;

    await ctx.db.patch(args.projectId, {
      status: "ready",
      progress: 100,
      summary,
      updatedAt: Date.now(),
    });

    return { ok: true as const, runId };
  },
});
