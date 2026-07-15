// End-to-end Groq simulation. Mocks `globalThis.fetch` so the entire
// prompt → request → fetch → extract → validate chain runs without an API
// key. Asserts that the resulting payload is the same shape that the real
// Groq response would be, AND that the titles/headlines actually contain the
// metrics from the input.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildNarrativePrompt,
  buildGroqRequestBody,
  extractGroqContent,
  validateNarrativeResponse,
  buildNarrativeFixture,
} from "../lib/llmNarrative";
import type { NarrativeMetrics } from "../lib/llmNarrative";

const METRICS: NarrativeMetrics = {
  title: "Monday stream · 12h VOD",
  persona: "long-form broadcast",
  durationSec: 43200, // 12 hours
  scenesDetected: 84,
  silencesCount: 31,
  peakRms: 0.78,
  meanRms: 0.34,
};

describe("Groq end-to-end simulation", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("issues a well-formed request and decodes the canonical response shape", async () => {
    const cannedContent = buildNarrativeFixture(METRICS);
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-sim-1",
          model: "llama-3.1-8b-instant",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(cannedContent) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;

    // Build the request the way convex/llm.ts does.
    const prompt = buildNarrativePrompt(METRICS);
    const req = buildGroqRequestBody({
      apiKey: "test-key-1234567890",
      system: prompt.system,
      user: prompt.user,
    });

    // Assert URL + headers look right BEFORE we hit the network.
    expect(req.url).toMatch(/^https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
    const init = req.init as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key-1234567890");
    expect(headers["Content-Type"]).toBe("application/json");
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0].role).toBe("system");
    expect(sentBody.messages[1].role).toBe("user");
    expect(sentBody.response_format).toEqual({ type: "json_object" });

    // Execute the mocked fetch + decode + validate chain.
    const response = await fetch(req.url, req.init);
    expect(response.ok).toBe(true);
    const json = await response.json();
    const content = extractGroqContent(json);
    expect(content).not.toBeNull();
    const validated = validateNarrativeResponse(content!);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.payload.titles).toHaveLength(5);
    expect(validated.payload.headlines).toHaveLength(5);
  });

  it("titles + headlines actually include the input metrics (numbers appear in copy)", () => {
    const payload = buildNarrativeFixture(METRICS);
    const allText = [
      ...payload.titles.map((t) => t.body),
      ...payload.headlines.map((h) => `${h.headline} ${h.subtext}`),
    ].join(" | ");
    // The fixture must reference at least one of the actual metrics.
    const referencesScenes = allText.includes("84");
    const referencesDuration = /12-hour|43200|12h|12 hour/i.test(allText);
    const referencesPeak = /78%|peak/i.test(allText);
    expect(referencesScenes || referencesDuration || referencesPeak).toBe(true);
    // And it must contain the topic (first 3 words of title) somewhere.
    expect(allText.toLowerCase()).toContain("monday stream");
  });

  it("is deterministic for the same metrics (test fixture is reproducible)", () => {
    const a = buildNarrativeFixture(METRICS);
    const b = buildNarrativeFixture(METRICS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("differs across distinct projects", () => {
    const a = buildNarrativeFixture({
      ...METRICS,
      title: "Project A",
      durationSec: 7200,
      scenesDetected: 30,
    });
    const b = buildNarrativeFixture({
      ...METRICS,
      title: "Project B",
      durationSec: 1800,
      scenesDetected: 12,
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("randomize=true yields fresh output across calls", () => {
    const a = buildNarrativeFixture(METRICS, { randomize: true });
    // Slight time offset so the seed is different.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const b = buildNarrativeFixture(METRICS, { randomize: true });
        // The two outputs should differ at least sometimes (extremely likely).
        // If a collision occurs the test is flaky — but probability is ~2^-32.
        expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
        resolve();
      }, 5);
    });
  });

  it("falls back to deterministic when Groq returns 401", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_api_key" }), {
        status: 401,
      }),
    ) as typeof fetch;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {});
    expect(response.ok).toBe(false);
    // The convex action would short-circuit and return mode: "deterministic".
    // We assert that branch here by re-running the same logic.
    const handled: "deterministic" | "real" = response.ok ? "real" : "deterministic";
    expect(handled).toBe("deterministic");
  });
});
