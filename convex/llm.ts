// Server-side narrative stage. Wraps the pure `handleGenerateNarrative`
// helper (in `./_narrativeHelpers.ts`) as a Convex action so it can be
// invoked via `ctx.runAction(api.llm.generateNarrative, …)` from the
// pipeline. All real IO + branching lives in the helper so it can be
// exercised end-to-end in Vitest with a mocked fetch + a mocked env.

import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  handleGenerateNarrative,
  type GenerateNarrativeArgs,
  type NarrativeResult,
} from "./_narrativeHelpers";

export type { NarrativeResult, GenerateNarrativeArgs };

export const generateNarrative = action({
  args: {
    title: v.string(),
    persona: v.optional(v.string()),
    durationSec: v.number(),
    scenesDetected: v.number(),
    silencesCount: v.number(),
    peakRms: v.number(),
    meanRms: v.number(),
    model: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<NarrativeResult> => {
    return handleGenerateNarrative(args, process.env as Record<string, string | undefined>);
  },
});
