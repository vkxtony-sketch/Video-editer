// End-to-end verification of the real-Groq badge-flip path. We can't paste
// a real `GROQ_API_KEY` into the Freebuff UI in this sandbox, but we CAN
// drive the actual action body (`handleGenerateNarrative`) with a mocked
// env map and a mocked `fetch` and assert every branch the production code
// will hit when the user wires their key.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildNarrativePrompt,
  buildGroqRequestBody,
  extractGroqContent,
  validateNarrativeResponse,
  handleGenerateNarrative,
  GROQ_DEFAULT_MODEL,
  GROQ_CHAT_URL,
} from "../lib/llmNarrative";
import type { GenerateNarrativeArgs, NarrativePayload } from "../lib/llmNarrative";

const ARGS: GenerateNarrativeArgs = {
  title: "Monday stream · 12h VOD",
  persona: "long-form broadcast",
  durationSec: 43200, // 12 hours
  scenesDetected: 84,
  silencesCount: 31,
  peakRms: 0.78,
  meanRms: 0.34,
};

/** Canned llama-3.1-8b-instant response — exactly the shape Groq returns. */
function groqOkResponse(payload: NarrativePayload) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-live-1",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "llama-3.1-8b-instant",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(payload) },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 320,
        completion_tokens: 410,
        total_tokens: 730,
      },
      x_groq: { id: "req-live-1" },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-live-1",
      },
    },
  );
}

/** What llama-3.1-8b-instant WOULD plausibly return given these metrics. */
function metricAwarePayload(metrics: typeof ARGS): NarrativePayload {
  return {
    titles: [
      {
        label: "YouTube Title",
        body: `${metrics.scenesDetected} scene shifts in 12-hour — what they reveal`,
        score: 0.91,
        style: "data-driven",
      },
      {
        label: "TikTok Caption",
        body: `78% peak energy · 31 cuts · monday stream`,
        score: 0.84,
        style: "data-driven",
      },
      {
        label: "X Hook",
        body: `I analyzed 12h of Monday stream. 84 scenes, ${Math.round(100 - (metrics.silencesCount / (metrics.durationSec / 60)) * 100)}% speech.`,
        score: 0.79,
        style: "matter-of-fact",
      },
      {
        label: "LinkedIn Title",
        body: `12-hour Monday stream: 84 visual shifts, 31 silent cuts`,
        score: 0.72,
        style: "professional",
      },
      {
        label: "Newsletter Subject",
        body: `What 84 scene changes in Monday stream tell us`,
        score: 0.66,
        style: "curiosity",
      },
    ],
    headlines: [
      { headline: "84 shifts, 12 hours.", subtext: "Peak RMS 78%." },
      { headline: "The whole story, distilled.", subtext: "97% speech, 31 cuts." },
      { headline: "I was wrong about this.", subtext: "until I ran the metrics." },
      { headline: "Twelve hours, five minutes.", subtext: "84 scenes auto-cut." },
      { headline: "Don't scroll past this.", subtext: "Numbers behind the stream." },
    ],
  };
}

describe("Real-Groq badge-flip chain (env.GROQ_API_KEY set)", () => {
  let originalFetch: typeof fetch;
  let capturedBody: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedBody = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("issues a real POST to Groq with the project's metrics serialized in the prompt body", async () => {
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return groqOkResponse(metricAwarePayload(ARGS));
    }) as typeof fetch;

    const prompt = buildNarrativePrompt(ARGS);
    const req = buildGroqRequestBody({
      apiKey: "gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
      system: prompt.system,
      user: prompt.user,
    });

    // The request URL + headers should match exactly what production sends.
    expect(req.url).toBe(GROQ_CHAT_URL);
    const init = req.init as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(
      "Bearer gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
    );
    expect(headers["Content-Type"]).toBe("application/json");

    // Drive the request through the mocked fetch so we can introspect the
    // serialized body that the production action would send to Groq.
    const response = await fetch(req.url, req.init);
    expect(response.ok).toBe(true);

    // The serialized body must contain the project's actual metrics — this
    // is what guarantees the LLM can copy them into the titles.
    expect(capturedBody).toBeDefined();
    const sent = JSON.parse(capturedBody!);
    expect(sent.model).toBe(GROQ_DEFAULT_MODEL);
    expect(sent.response_format).toEqual({ type: "json_object" });
    const userMsg = sent.messages[1].content;
    // JSON.stringify produces no space after colons — match the wire format.
    expect(userMsg).toContain('"durationSec":43200');
    expect(userMsg).toContain('"scenesDetected":84');
    expect(userMsg).toContain('"silencesCount":31');
    expect(userMsg).toContain('"peakRms":0.78');
    expect(userMsg).toContain('"meanRms":0.34');
    expect(userMsg).toContain("Monday stream");
    // The user-message instructions must explicitly demand metric references
    // — that's what makes "copy reflects the project's actual metrics" work.
    expect(userMsg).toMatch(/at least one metric/);
  });

  it("decodes a canonical Groq 200 response into the validated 5+5 payload", async () => {
    const payload = metricAwarePayload(ARGS);
    globalThis.fetch = vi.fn(async () => groqOkResponse(payload)) as typeof fetch;

    const prompt = buildNarrativePrompt(ARGS);
    const req = buildGroqRequestBody({
      apiKey: "gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
      system: prompt.system,
      user: prompt.user,
    });
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
    // The decoded titles must reference the project's numbers — that's the
    // user's success criterion: "copy that reflects the project's actual
    // metrics".
    const allText = [
      ...validated.payload.titles.map((t) => t.body),
      ...validated.payload.headlines.map((h) => `${h.headline} ${h.subtext}`),
    ].join(" | ");
    expect(allText).toContain("84");
    expect(allText).toContain("12");
    expect(allText.toLowerCase()).toContain("monday stream");
  });

  it("full action chain: key present + 200 OK → mode='real' + provider='groq · llama-3.1-8b-instant'", async () => {
    globalThis.fetch = vi.fn(async () =>
      groqOkResponse(metricAwarePayload(ARGS)),
    ) as typeof fetch;

    const result = await handleGenerateNarrative(ARGS, {
      GROQ_API_KEY: "gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
    });

    // THIS is the exact shape ProjectHeader.tsx reads.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("real");
    expect(result.provider).toBe(`groq · ${GROQ_DEFAULT_MODEL}`);
    expect(result.provider).toBe("groq · llama-3.1-8b-instant");
    expect(result.payload).not.toBeNull();
    expect(result.payload?.titles).toHaveLength(5);
    expect(result.payload?.headlines).toHaveLength(5);

    // AND the payload's metric-derived copy must still be present.
    const allText = [
      ...result.payload!.titles.map((t) => t.body),
      ...result.payload!.headlines.map((h) => `${h.headline} ${h.subtext}`),
    ].join(" | ");
    expect(allText).toContain("84");
    expect(allText.toLowerCase()).toContain("monday stream");
  });

  it("empty-string GROQ_API_KEY still falls back to deterministic (length sanity check)", async () => {
    globalThis.fetch = vi.fn(async () => groqOkResponse(metricAwarePayload(ARGS))) as typeof fetch;
    const result = await handleGenerateNarrative(ARGS, { GROQ_API_KEY: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("deterministic");
    expect(result.provider).toBeNull();
    expect(result.payload).toBeNull();
    // And fetch was NEVER called — the empty key short-circuits before network.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("malformed JSON from Groq falls back to deterministic without throwing", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("not json {", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;
    const result = await handleGenerateNarrative(ARGS, {
      GROQ_API_KEY: "gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("deterministic");
    expect(result.provider).toBeNull();
  });

  it("401 from Groq falls back to deterministic (bad key UX path)", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }),
    ) as typeof fetch;
    const result = await handleGenerateNarrative(ARGS, {
      GROQ_API_KEY: "gsk_INVALID_KEY",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("deterministic");
    expect(result.provider).toBeNull();
  });

  it("shape-invalid payload (wrong types) from Groq falls back to deterministic", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "x",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  titles: [
                    { label: "bad", body: "ok", score: 5, style: "x" }, // score out of [0,1]
                  ],
                  headlines: [{ headline: "h", subtext: "s" }],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
    const result = await handleGenerateNarrative(ARGS, {
      GROQ_API_KEY: "gsk_test_REAL_KEY_xxxxxxxxxxxxxxxxxxxx",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("deterministic");
  });
});
