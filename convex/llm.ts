// Server-side narrative stage. Calls Groq's OpenAI-compatible chat
// completions endpoint with the project's analytics metrics and returns a
// validated JSON payload of titles + headlines. Falls back to a structured
// "deterministic" result when:
//   - GROQ_API_KEY is missing
//   - Groq returns a non-OK status
//   - JSON parsing / shape validation fails
//   - the request times out (>8s)
//
// The action never throws — callers can rely on the discriminated return shape.

import { v } from "convex/values";
import { action } from "./_generated/server";
import {
  buildGroqRequestBody,
  buildNarrativeFixture,
  buildNarrativePrompt,
  extractGroqContent,
  validateNarrativeResponse,
  type NarrativeMetrics,
  type NarrativePayload,
} from "./_narrativeHelpers";

export type NarrativeResult =
  | {
      ok: true;
      mode: "real";
      provider: string;
      payload: NarrativePayload;
    }
  | { ok: true; mode: "deterministic"; provider: null; payload: null };

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
    const apiKey = process.env.GROQ_API_KEY;
    const demoMode = process.env.GROQ_DEMO_MODE === "simulate";

    // Dev-only fixture path. Activated only when BOTH GROQ_DEMO_MODE=simulate
    // is set AND no real GROQ_API_KEY is present — so a stray env var in
    // production (where the user has wired a real key) cannot accidentally
    // swap real copy for fixture copy. Returns a deterministic, metric-driven
    // payload so the user can verify the badge flip + numeric copy without
    // burning Groq quota.
    if (demoMode && (!apiKey || apiKey.length < 10)) {
      const metrics: NarrativeMetrics = {
        title: args.title,
        persona: args.persona,
        durationSec: args.durationSec,
        scenesDetected: args.scenesDetected,
        silencesCount: args.silencesCount,
        peakRms: args.peakRms,
        meanRms: args.meanRms,
      };
      const payload = buildNarrativeFixture(metrics);
      return {
        ok: true,
        mode: "real",
        provider: "groq · fixture (no API call)",
        payload,
      };
    }

    if (!apiKey || apiKey.length < 10) {
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }

    const metrics: NarrativeMetrics = {
      title: args.title,
      persona: args.persona,
      durationSec: args.durationSec,
      scenesDetected: args.scenesDetected,
      silencesCount: args.silencesCount,
      peakRms: args.peakRms,
      meanRms: args.meanRms,
    };

    let response: Response;
    try {
      const built = buildNarrativePrompt(metrics);
      const req = buildGroqRequestBody({
        apiKey,
        model: args.model,
        system: built.system,
        user: built.user,
      });
      response = await fetch(req.url, req.init);
    } catch (e) {
      console.warn("[llm] Groq fetch failed, falling back:", (e as Error).message);
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(
        `[llm] Groq returned ${response.status}, falling back:`,
        body.slice(0, 200),
      );
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (e) {
      console.warn("[llm] Groq body parse failed:", (e as Error).message);
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }
    const content = extractGroqContent(json);
    if (content == null) {
      console.warn("[llm] Groq returned no assistant content");
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }
    const validated = validateNarrativeResponse(content);
    if (!validated.ok) {
      console.warn("[llm] Groq payload shape invalid:", validated.error);
      return { ok: true, mode: "deterministic", provider: null, payload: null };
    }
    const model = args.model ?? "llama-3.1-8b-instant";
    return {
      ok: true,
      mode: "real",
      provider: `groq · ${model}`,
      payload: validated.payload,
    };
  },
});
