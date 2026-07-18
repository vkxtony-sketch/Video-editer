// Convex backend for the client-side error trap installed in
// `src/lib/clientErrorTrap.ts` and `src/components/ClientErrorBoundary.tsx`.
//
// Hard server-side caps on every string field — the client-side sanitizer
// is best-effort and trustworthy only for well-meaning callers. This
// mutation is the security boundary.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_MESSAGE = 1024;
const MAX_STACK = 5_000;
const MAX_ROUTE = 256;
const MAX_FILENAME = 256;
const MAX_EXTRA = 2_000;
const MAX_OWNER = 128;

export const capture = mutation({
  args: {
    kind: v.union(
      v.literal("error"),
      v.literal("unhandledrejection"),
      v.literal("boundary"),
      v.literal("console.error"),
    ),
    route: v.string(),
    message: v.string(),
    stack: v.optional(v.string()),
    filename: v.optional(v.string()),
    lineno: v.optional(v.number()),
    colno: v.optional(v.number()),
    extra: v.optional(v.string()),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Server-side cap is the authoritative destruction. Slice every string
    // so a 1MB gossipy stack frame can't blow Convex row size.
    const row = {
      kind: args.kind,
      route: args.route.slice(0, MAX_ROUTE),
      message: args.message.slice(0, MAX_MESSAGE) || "<empty>",
      stack: args.stack?.slice(0, MAX_STACK),
      filename: args.filename?.slice(0, MAX_FILENAME),
      lineno: args.lineno,
      colno: args.colno,
      extra: args.extra?.slice(0, MAX_EXTRA),
      ownerId: args.ownerId?.slice(0, MAX_OWNER),
      createdAt: Date.now(),
    } as const;
    const id = await ctx.db.insert("clientErrors", row);
    return { id };
  },
});

export const recent = query({
  args: {
    limit: v.optional(v.number()),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const n = Math.max(1, Math.min(100, args.limit ?? 50));
    const ownerId = args.ownerId?.slice(0, MAX_OWNER);
    if (ownerId) {
      return await ctx.db
        .query("clientErrors")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .order("desc")
        .take(n);
    }
    return await ctx.db
      .query("clientErrors")
      .withIndex("by_createdAt")
      .order("desc")
      .take(n);
  },
});

export const clear = mutation({
  args: {
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = args.ownerId?.slice(0, MAX_OWNER);
    if (ownerId) {
      const rows = await ctx.db
        .query("clientErrors")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
      return { removed: rows.length };
    }
    const rows = await ctx.db.query("clientErrors").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { removed: rows.length };
  },
});
