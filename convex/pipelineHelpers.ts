import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const _createRun = mutation({
  args: {
    projectId: v.id("projects"),
    startedAt: v.number(),
    activeStage: v.string(),
    overallProgress: v.number(),
    demoMode: v.boolean(),
    llmMode: v.optional(
      v.union(v.literal("real"), v.literal("deterministic")),
    ),
    llmProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pipelineRuns", args);
  },
});

export const _appendLog = mutation({
  args: {
    projectId: v.id("projects"),
    runId: v.id("pipelineRuns"),
    stage: v.string(),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("ok")),
    message: v.string(),
    ts: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pipelineLogs", args);
  },
});

export const _tickProgress = mutation({
  args: {
    runId: v.id("pipelineRuns"),
    projectId: v.id("projects"),
    activeStage: v.string(),
    overallProgress: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      activeStage: args.activeStage,
      overallProgress: args.overallProgress,
    });
    await ctx.db.patch(args.projectId, {
      progress: args.overallProgress,
      updatedAt: Date.now(),
    });
  },
});

export const _writeArtifacts = mutation({
  args: {
    projectId: v.id("projects"),
    clips: v.array(
      v.object({
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const c of args.clips) {
      await ctx.db.insert("clips", c);
    }
  },
});

export const _writeTitles = mutation({
  args: {
    projectId: v.id("projects"),
    titles: v.array(
      v.object({
        projectId: v.id("projects"),
        label: v.string(),
        body: v.string(),
        score: v.number(),
        style: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const t of args.titles) {
      await ctx.db.insert("titles", t);
    }
  },
});

export const _writeThumbnails = mutation({
  args: {
    projectId: v.id("projects"),
    thumbnails: v.array(
      v.object({
        projectId: v.id("projects"),
        headline: v.string(),
        subtext: v.string(),
        palette: v.string(),
        score: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const t of args.thumbnails) {
      await ctx.db.insert("thumbnails", t);
    }
  },
});

export const _writeCaptions = mutation({
  args: {
    projectId: v.id("projects"),
    captions: v.array(
      v.object({
        projectId: v.id("projects"),
        startSec: v.number(),
        endSec: v.number(),
        speaker: v.string(),
        text: v.string(),
        sentiment: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const c of args.captions) {
      await ctx.db.insert("captions", c);
    }
  },
});

export const _finishRun = mutation({
  args: {
    runId: v.id("pipelineRuns"),
    projectId: v.id("projects"),
    activeStage: v.string(),
    overallProgress: v.number(),
    llmMode: v.optional(
      v.union(v.literal("real"), v.literal("deterministic")),
    ),
    llmProvider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      activeStage: args.activeStage,
      overallProgress: args.overallProgress,
      finishedAt: Date.now(),
      llmMode: args.llmMode,
      llmProvider: args.llmProvider,
    });
  },
});
