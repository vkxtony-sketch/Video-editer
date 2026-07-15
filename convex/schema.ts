import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    title: v.string(),
    source: v.union(
      v.literal("upload"),
      v.literal("url"),
      v.literal("demo"),
      v.literal("sample"),
    ),
    sourceUrl: v.optional(v.string()),
    sourceLabel: v.optional(v.string()),
    durationSec: v.number(),
    sizeMb: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    progress: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ownerId: v.string(),
    persona: v.optional(v.string()),
    summary: v.optional(v.string()),
    audioScanDone: v.optional(v.boolean()),
    audioCutCount: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  pipelineRuns: defineTable({
    projectId: v.id("projects"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    activeStage: v.string(),
    overallProgress: v.number(),
    demoMode: v.boolean(),
    /** "real" = a real LLM (e.g. Groq) generated titles/headlines. "deterministic" = pool fallback. */
    llmMode: v.optional(
      v.union(v.literal("real"), v.literal("deterministic")),
    ),
    /** Friendly label of the LLM provider used (e.g. "groq · llama-3.1-8b-instant"). */
    llmProvider: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  pipelineLogs: defineTable({
    projectId: v.id("projects"),
    runId: v.id("pipelineRuns"),
    stage: v.string(),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("ok")),
    message: v.string(),
    ts: v.number(),
  }).index("by_project", ["projectId"]),

  clips: defineTable({
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
  }).index("by_project", ["projectId"]),

  titles: defineTable({
    projectId: v.id("projects"),
    label: v.string(),
    body: v.string(),
    score: v.number(),
    style: v.string(),
  }).index("by_project", ["projectId"]),

  thumbnails: defineTable({
    projectId: v.id("projects"),
    headline: v.string(),
    subtext: v.string(),
    palette: v.string(),
    score: v.number(),
    imageDataUrl: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  captions: defineTable({
    projectId: v.id("projects"),
    startSec: v.number(),
    endSec: v.number(),
    speaker: v.string(),
    text: v.string(),
    sentiment: v.string(),
  }).index("by_project", ["projectId"]),

  // Scene-change markers detected by the client-side frame-hash analysis.
  // Surfaced on the TimelineStrip as dashed vertical lines.
  projectScenes: defineTable({
    projectId: v.id("projects"),
    tSec: v.number(),
    distance: v.number(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
});
