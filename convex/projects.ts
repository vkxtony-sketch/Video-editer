import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function randomId(): string {
  return "u_" + Math.random().toString(36).slice(2, 10);
}

export const create = mutation({
  args: {
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
    persona: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ownerId = randomId();
    const projectId = await ctx.db.insert("projects", {
      title: args.title,
      source: args.source,
      sourceUrl: args.sourceUrl,
      sourceLabel: args.sourceLabel,
      durationSec: Math.max(60, Math.floor(args.durationSec)),
      sizeMb: args.sizeMb,
      status: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      ownerId,
      persona: args.persona,
    });
    return { projectId, ownerId };
  },
});

export const list = query({
  args: { ownerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const ownerId = args.ownerId ?? "any";
    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("projects"),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      progress: args.progress ?? 0,
      summary: args.summary,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("clips")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const c of clips) await ctx.db.delete(c._id);
    const titles = await ctx.db
      .query("titles")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const t of titles) await ctx.db.delete(t._id);
    const thumbs = await ctx.db
      .query("thumbnails")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const t of thumbs) await ctx.db.delete(t._id);
    const caps = await ctx.db
      .query("captions")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const c of caps) await ctx.db.delete(c._id);
    const runs = await ctx.db
      .query("pipelineRuns")
      .withIndex("by_project", (q) => q.eq("projectId", args.id))
      .collect();
    for (const r of runs) {
      const logs = await ctx.db
        .query("pipelineLogs")
        .withIndex("by_project", (q) => q.eq("projectId", args.id))
        .collect();
      for (const l of logs) await ctx.db.delete(l._id);
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.id);
  },
});
