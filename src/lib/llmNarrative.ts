// Thin re-export shim. Canonical implementations live in
// `convex/_narrativeHelpers.ts` — we re-export here so the React client
// (Vite + Vitest) can keep importing from `../lib/llmNarrative` as before.
//
// The Convex tsconfig only includes `convex/`, so the canonical file lives
// there to avoid cross-folder path gymnastics. The leading underscore in
// `_narrativeHelpers.ts` keeps Convex from treating it as an endpoint
// (no mutation/action/query exports).

export {
  GROQ_DEFAULT_MODEL,
  GROQ_CHAT_URL,
  buildNarrativePrompt,
  validateNarrativeResponse,
  buildGroqRequestBody,
  extractGroqContent,
  buildNarrativeFixture,
  handleGenerateNarrative,
} from "../../convex/_narrativeHelpers";

export type {
  NarrativeTitle,
  NarrativeHeadline,
  NarrativePayload,
  NarrativeMetrics,
  GenerateNarrativeArgs,
  NarrativeResult,
} from "../../convex/_narrativeHelpers";
