// Pure narrative-side helpers for the LLM stage. Lives under `convex/` so
// that Convex's compiler (whose tsconfig includes only `convex/`) can
// resolve it directly without any cross-folder path gymnastics. The leading
// underscore signals this is private/internal: it does NOT export any
// mutation / action / query, so Convex will not deploy it as an endpoint.
//
// Re-exported via `src/lib/llmNarrative.ts` so the React client can also
// use it (Vitest runs against the tsconfig.app.json which includes both
// `src` and `convex`, so this works on both sides).

export type NarrativeTitle = {
  label: string;
  body: string;
  score: number;
  style: string;
};

export type NarrativeHeadline = {
  headline: string;
  subtext: string;
  score?: number;
  palette?: string;
};

export type NarrativePayload = {
  titles: NarrativeTitle[];
  headlines: NarrativeHeadline[];
};

export type NarrativeMetrics = {
  title: string;
  persona?: string;
  durationSec: number;
  scenesDetected: number;
  silencesCount: number;
  peakRms: number;
  meanRms: number;
};

/** Default model. Free, fast, OpenAI-compatible, supports JSON mode. */
export const GROQ_DEFAULT_MODEL = "llama-3.1-8b-instant";

/** Groq's OpenAI-compatible chat completions endpoint. */
export const GROQ_CHAT_URL =
  "https://api.groq.com/openai/v1/chat/completions";

/**
 * Build the system+user payload for a Groq chat-completions call.
 * Returns `{ system, user }` strings plus the parsed JSON the model is
 * expected to return. Using Groq's `response_format: { type: "json_object" }`
 * for safety; the validator then enforces the shape.
 */
export function buildNarrativePrompt(metrics: NarrativeMetrics): {
  system: string;
  user: string;
  expectedShape: { titles: number; headlines: number };
} {
  const system = [
    "You are a senior YouTube growth strategist and SEO copywriter.",
    "Given one analytics payload describing a long-form video project,",
    "produce a structured JSON narrative pack with two arrays:",
    "`titles` (5 entries) and `headlines` (5 entries).",
    "Each `titles[]` entry has: label (one of: YouTube Title, TikTok Caption, X Hook, LinkedIn Title, Newsletter Subject),",
    "body (≤80 chars for YouTube/LinkedIn, ≤140 chars for X), score (0..1), style (one of: data-driven, clickbait, story, professional, curiosity).",
    "Each `headlines[]` entry has: headline (≤40 chars), subtext (≤60 chars).",
    "Return ONLY a JSON object — no prose, no markdown fences. No commentary.",
  ].join(" ");

  const user = JSON.stringify({
    project: {
      title: metrics.title,
      persona: metrics.persona ?? "long-form",
      durationSec: metrics.durationSec,
      durationLabel: humanDuration(metrics.durationSec),
    },
    metrics: {
      scenesDetected: metrics.scenesDetected,
      silencesCount: metrics.silencesCount,
      peakRms: round4(metrics.peakRms),
      meanRms: round4(metrics.meanRms),
      speechFraction: round4(
        1 - Math.min(1, metrics.silencesCount / Math.max(1, metrics.durationSec / 60)),
      ),
    },
    instructions: [
      "Lean on the numbers — titles must reference at least one metric.",
      "Avoid hashtags, all-caps, and clickbait clichés like \"You won't believe\".",
      "If durationSec ≥ 7200 (2h+), emphasize the highlight-reel framing.",
      "If scenesDetected > 30, mention scene-changes as a hook.",
    ],
  });

  return {
    system,
    user,
    expectedShape: { titles: 5, headlines: 5 },
  };
}

/**
 * Parse + validate a Groq chat-completions response. Accepts either the
 * raw string content OR the parsed JSON. Returns `{ ok: true, payload }` or
 * `{ ok: false, error }`. Pure — no side effects.
 */
export function validateNarrativeResponse(
  raw: string | unknown,
): { ok: true; payload: NarrativePayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "root is not an object" };
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.titles) || !Array.isArray(obj.headlines)) {
    return {
      ok: false,
      error: "missing `titles` or `headlines` arrays",
    };
  }
  const titleErr = firstInvalid(obj.titles, isValidTitle);
  if (titleErr) return { ok: false, error: `titles: ${titleErr}` };
  const headErr = firstInvalid(obj.headlines, isValidHeadline);
  if (headErr) return { ok: false, error: `headlines: ${headErr}` };
  return {
    ok: true,
    payload: {
      titles: obj.titles as NarrativeTitle[],
      headlines: obj.headlines as NarrativeHeadline[],
    },
  };
}

function isValidTitle(v: unknown): string | null {
  const t = v as Record<string, unknown>;
  if (typeof t?.label !== "string" || t.label.length === 0) return "label is not a non-empty string";
  if (typeof t?.body !== "string" || t.body.length === 0) return "body is not a non-empty string";
  if (typeof t?.score !== "number" || t.score < 0 || t.score > 1) return "score is not in [0,1]";
  if (typeof t?.style !== "string") return "style is not a string";
  return null;
}

function isValidHeadline(v: unknown): string | null {
  const h = v as Record<string, unknown>;
  if (typeof h?.headline !== "string" || h.headline.length === 0) return "headline is not a non-empty string";
  if (typeof h?.subtext !== "string" || h.subtext.length === 0) return "subtext is not a non-empty string";
  return null;
}

function firstInvalid(
  arr: unknown[],
  check: (v: unknown) => string | null,
): string | null {
  for (let i = 0; i < arr.length; i++) {
    const err = check(arr[i]);
    if (err) return `index ${i}: ${err}`;
  }
  return null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function humanDuration(sec: number): string {
  if (sec >= 3600) return `${Math.round(sec / 3600)}-hour`;
  if (sec >= 60) return `${Math.round(sec / 60)}-minute`;
  return `${Math.round(sec)}-second`;
}

/**
 * Build the JSON body for a Groq chat-completions HTTP POST. Pure so it
 * can be tested + reused from any runtime.
 */
export function buildGroqRequestBody(opts: {
  apiKey: string;
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): { url: string; init: RequestInit } {
  const model = opts.model ?? GROQ_DEFAULT_MODEL;
  return {
    url: GROQ_CHAT_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
        stream: false,
      }),
    },
  };
}

/**
 * Extract the assistant message content out of a Groq chat-completions
 * response. Pure — does not perform any IO.
 */
export function extractGroqContent(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;
  const choices = r.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown>;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" ? content : null;
}

/**
 * Deterministic fixture that mimics what `llama-3.1-8b-instant` would return
 * for the given metrics. Used by the dev-only `GROQ_DEMO_MODE=simulate`
 * escape hatch so the user can verify the badge flips + metric-driven copy
 * renders without spending Groq quota.
 *
 * Same metrics → same output (deterministic via a simple hash). When
 * `randomize: true`, the seed is mixed with `Date.now()` for fresh output
 * each call.
 */
export function buildNarrativeFixture(
  metrics: NarrativeMetrics,
  opts: { randomize?: boolean } = {},
): NarrativePayload {
  const baseSeed = strHashSeed(`${metrics.title}|${metrics.durationSec}`);
  const seed = opts.randomize ? baseSeed ^ (Date.now() & 0xffff) : baseSeed;
  const r = seededRand(seed);
  const dur = humanDuration(metrics.durationSec);
  const topic = (metrics.title.split(/\s+/).slice(0, 3).join(" ") || "this clip")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gi, "");
  const peakPct = Math.round(metrics.peakRms * 100);
  const speechPct = Math.round(
    (1 - Math.min(1, metrics.silencesCount / Math.max(1, metrics.durationSec / 60))) *
      100,
  );

  const titles: NarrativeTitle[] = [
    {
      label: "YouTube Title",
      body: `${metrics.scenesDetected} scene shifts in ${dur} — what they reveal about ${topic}`,
      score: round2(0.82 + r() * 0.1),
      style: "data-driven",
    },
    {
      label: "TikTok Caption",
      body: `${peakPct}% peak energy · ${metrics.silencesCount} cuts · ${topic}`,
      score: round2(0.74 + r() * 0.1),
      style: "data-driven",
    },
    {
      label: "X Hook",
      body: `I ran the audio analysis on ${dur} of ${topic}. ${metrics.scenesDetected} scenes, ${speechPct}% speech.`,
      score: round2(0.68 + r() * 0.1),
      style: "matter-of-fact",
    },
    {
      label: "LinkedIn Title",
      body: `${dur} on ${topic}: ${metrics.scenesDetected} visual shifts, ${metrics.silencesCount} silent cuts`,
      score: round2(0.61 + r() * 0.1),
      style: "professional",
    },
    {
      label: "Newsletter Subject",
      body: `What ${metrics.scenesDetected} scene changes in ${topic} tell us`,
      score: round2(0.55 + r() * 0.1),
      style: "curiosity",
    },
  ];

  const headlines: NarrativeHeadline[] = [
    { headline: `${metrics.scenesDetected} shifts, ${dur}.`, subtext: `Peak RMS ${peakPct}%.` },
    {
      headline: "The whole story, distilled.",
      subtext: `${speechPct}% speech, ${metrics.silencesCount} cuts.`,
    },
    { headline: "I was wrong about this.", subtext: "until I ran the metrics." },
    {
      headline: "Twelve hours, five minutes.",
      subtext: `${metrics.scenesDetected} scenes auto-cut.`,
    },
    { headline: "Don't scroll past this.", subtext: `Numbers behind ${topic}.` },
  ];

  return { titles, headlines };
}

/** FNV-1a 32-bit, exposed for the deterministic fixture seed. */
function strHashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tiny seeded LCG (Numerical Recipes constants). Same shape as the one in
 * `convex/pipeline.ts`, kept private here so the fixture doesn't import
 * anything that touches Convex's deployment surface.
 */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
