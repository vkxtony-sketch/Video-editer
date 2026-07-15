"use node";
// Neon AI Lab pipeline. This is a server-side Convex action that runs the
// 7-stage AI pipeline. Heavy compute is NOT performed here — we use a
// deterministic, project-aware generator that produces structured artifacts
// shaped exactly the way real model calls would. Each project's title and
// persona seed the generator, so two distinct projects produce distinct
// highlights, captions, titles, etc.
//
// To upgrade a stage to a real model call, replace the corresponding
// `pick*` helper with an `await fetch(...)` against the relevant API. The
// Convex action runs in the "use node" runtime and can read process.env.

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

type Stage = {
  key: string;
  label: string;
  durationMs: number;
  weight: number;
};

const STAGES: Stage[] = [
  { key: "ingest", label: "Adaptive Chunk Ingest", durationMs: 1500, weight: 8 },
  { key: "scan", label: "Fast Scan · Frames · Audio · OCR", durationMs: 2000, weight: 12 },
  {
    key: "transcribe",
    label: "Speech Recognition · 100+ Languages",
    durationMs: 2200,
    weight: 18,
  },
  { key: "narrative", label: "LLM Narrative Reasoning", durationMs: 2000, weight: 14 },
  {
    key: "vision",
    label: "Computer Vision · Faces · Objects · Motion",
    durationMs: 2000,
    weight: 14,
  },
  {
    key: "scoring",
    label: "Timeline Intelligence · Per-second Scoring",
    durationMs: 1800,
    weight: 16,
  },
  {
    key: "autocut",
    label: "Auto-Edit · Silence · Filler · Dead Air",
    durationMs: 2200,
    weight: 18,
  },
];

function seedrand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Stable, deterministic 32-bit hash of a string (FNV-1a). Used to turn a
// project's title + persona into a seed that's unique per project but
// reproducible across runs.
function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Pools are static but the seeds are project-aware, so each project gets
// distinct output.
const TITLE_POOL = [
  "The single line that changed how I think about this",
  "Why everything you've heard about this is wrong",
  "The 90-second version nobody will tell you about",
  "I tried this for 30 days. Here's the data.",
  "Three things I wish I knew before starting",
  "Stop doing this immediately",
  "The whole story in five minutes",
  "What I learned shipping this to a million people",
  "The cleanest explanation I can give",
  "One small change that moved every metric",
  "The honest review no brand wants you to read",
  "I rebuilt this twice. Here's what worked.",
  "The thing nobody tells you about {topic}",
  "Don't start this until you've watched the first 60 seconds",
  "Five years of data, three minutes of conclusions",
  "I tested every shortcut so you don't have to",
  "The exact playbook I used to scale this",
  "A real conversation about {topic}",
  "What changed when I stopped overthinking it",
  "The version I wish someone had sent me on day one",
];

const HEADLINE_POOL = [
  { headline: "It actually works.", sub: "and here's the receipts" },
  { headline: "The whole story.", sub: "in under five minutes" },
  { headline: "Don't scroll past this.", sub: "what nobody tells you" },
  { headline: "I was wrong about this.", sub: "until I tried it" },
  { headline: "Quietly life-changing.", sub: "watch till the end" },
  { headline: "Twenty-four hours → five minutes.", sub: "the AI did this" },
  { headline: "The breakthrough everyone missed.", sub: "until now" },
  { headline: "I built the thing I wish existed.", sub: "and it's free" },
];

const CAPTION_TEMPLATES = [
  "Alright let me just dive in.",
  "So here's the thing — nobody talks about this.",
  "I tried it for thirty days.",
  "And the result kind of broke my brain.",
  "Wait — hold on — let me back up.",
  "So the first thing you need to know is…",
  "Most people get this fundamentally wrong.",
  "You don't need to spend money, you don't need to grind.",
  "But you DO need to do this one thing every single day.",
  "If you take one thing away — let it be that.",
  "Alright so let me show you exactly how I do it.",
  "The numbers behind this are wild.",
  "And here is where it gets interesting.",
  "Look — I'm not going to dress this up.",
  "The truth is the opposite of what most people say.",
  "This is the part that surprised me the most.",
  "Let me show you the receipts.",
  "If you remember nothing else, remember this.",
];

const HIGHLIGHT_RATIONALES = [
  "Strong narrative payoff, high energy delta, faces present.",
  "Quantified hook + retention signal; ideal short candidate.",
  "Speaker introduces a counter-intuitive claim — high curiosity drop.",
  "Visual change of pace; new framing appears in this window.",
  "Audience laughter or applause detected — peak engagement.",
  "Topic shift + chapter boundary; natural break for a chapter card.",
  "Confessional tone shift; emotional peak for story-led edits.",
  "Quoted statistic or named source — quotability score high.",
  "Action/visual hook + bold on-screen motion; vertical-native fit.",
  "Compressed recap — best highlight for a 60-second summary.",
];

const TAGS = [
  "viral-hook",
  "story-payoff",
  "controversial",
  "warm-take",
  "data-drop",
  "how-to",
  "candid",
  "surprise",
  "educational",
  "energy-spike",
];

// Replace {topic} placeholders using the project title for personalization.
function personalize(s: string, topic: string): string {
  return s.replace(/\{topic\}/g, topic);
}

function pickTitles(seed: number, title: string): string[] {
  const rand = seedrand(seed);
  const topic = title.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  return TITLE_POOL.map((t) => personalize(t, topic))
    .sort(() => rand() - 0.5)
    .slice(0, 9);
}

function pickHeadlines(seed: number, title: string): { headline: string; sub: string }[] {
  const rand = seedrand(seed);
  const topic = title.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  return HEADLINE_POOL.map((h) => ({
    headline: personalize(h.headline, topic),
    sub: personalize(h.sub, topic),
  }))
    .sort(() => rand() - 0.5)
    .slice(0, 6);
}

function pickCaptions(durationSec: number, seed: number): {
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
  sentiment: string;
}[] {
  const rand = seedrand(seed + 17);
  const sample = CAPTION_TEMPLATES;
  const sentiments = ["neutral", "curious", "calm", "surprised", "intense", "warm"];
  const out: {
    startSec: number;
    endSec: number;
    speaker: string;
    text: string;
    sentiment: string;
  }[] = [];
  let t = 60 + rand() * 90;
  const count = Math.max(8, Math.min(40, Math.floor(durationSec / 240)));
  for (let i = 0; i < count; i++) {
    const line = sample[Math.floor(rand() * sample.length)];
    const dur = 4 + rand() * 7;
    out.push({
      startSec: Math.floor(t),
      endSec: Math.floor(t + dur),
      speaker: i % 4 === 0 ? "Speaker B" : "Speaker A",
      text: line,
      sentiment: sentiments[Math.floor(rand() * sentiments.length)],
    });
    t += dur + (0.2 + rand() * 1.2);
  }
  return out;
}

function pickClips(durationSec: number, seed: number, projectId: Id<"projects">) {
  const rand = seedrand(seed + 5);
  const total = 12;
  const out = [];
  for (let i = 0; i < total; i++) {
    const start = Math.floor(120 + rand() * Math.max(120, durationSec - 240));
    const len = Math.floor(40 + rand() * 220);
    out.push({
      projectId,
      kind: "highlight" as const,
      title: TITLE_POOL[i % TITLE_POOL.length],
      startSec: start,
      endSec: start + len,
      score: Math.round((0.55 + rand() * 0.45) * 100) / 100,
      rationale: pick(rand, HIGHLIGHT_RATIONALES),
      tags: [TAGS[i % TAGS.length], TAGS[(i + 3) % TAGS.length]],
      createdAt: Date.now(),
    });
  }
  return out;
}

function pickShorts(durationSec: number, seed: number, projectId: Id<"projects">) {
  const rand = seedrand(seed + 11);
  const prompts = [
    "POV:",
    "Wait for it…",
    "Watch this part only.",
    "Listen closely.",
    "This one line.",
    "Don't skip this.",
    "The ending.",
    "60-second version.",
  ];
  const out = [];
  for (let i = 0; i < 8; i++) {
    const start = Math.floor(180 + rand() * Math.max(180, durationSec - 360));
    const len = 20 + Math.floor(rand() * 70);
    out.push({
      projectId,
      kind: "short" as const,
      title: prompts[i],
      startSec: start,
      endSec: start + len,
      score: Math.round((0.6 + rand() * 0.4) * 100) / 100,
      rationale:
        "Vertical-native hook with face-tracked speaker and crisp CTA moments.",
      tags: ["vertical", "short-form", "viral"],
      createdAt: Date.now(),
    });
  }
  return out;
}

function pickChapters(durationSec: number, seed: number, projectId: Id<"projects">) {
  if (durationSec < 600) return [];
  const rand = seedrand(seed + 23);
  const chapterLabels = [
    "Setup · Why this matters",
    "First principle",
    "Demo · The thing in action",
    "Twist · Where it broke",
    "Deep dive · Step by step",
    "Counterpoint · What critics miss",
    "Payoff · The takeaway",
    "Outro · What to do next",
  ];
  const count = Math.min(7, Math.max(3, Math.floor(durationSec / 1800)));
  const out = [];
  let t = 60;
  for (let i = 0; i < count; i++) {
    const dur = Math.floor(durationSec / count);
    out.push({
      projectId,
      kind: "chapter" as const,
      title: chapterLabels[i],
      startSec: t,
      endSec: t + dur - 30,
      score: 0,
      rationale: "Auto-segmented on scene + topic transition.",
      tags: ["chapter"],
      createdAt: Date.now(),
    });
    t += dur;
  }
  void rand;
  return out;
}

function pickCuts(durationSec: number, seed: number, projectId: Id<"projects">) {
  const rand = seedrand(seed + 41);
  const out = [];
  const count = Math.min(60, Math.max(8, Math.floor(durationSec / 360)));
  let t = 30;
  for (let i = 0; i < count; i++) {
    const dur = 1 + Math.floor(rand() * 6);
    out.push({
      projectId,
      kind: "cut" as const,
      title: dur > 3 ? "Long dead pause" : "Micro-pause",
      startSec: t,
      endSec: t + dur,
      score: 1 - Math.min(1, dur / 8),
      rationale: dur > 3 ? "Dead air > 3s, safe to cut" : "Filler breath, optional cut",
      tags: ["auto-cut", dur > 3 ? "dead-air" : "filler"],
      createdAt: Date.now(),
    });
    t += 60 + Math.floor(rand() * 90);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export const runPipeline = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(api.projects.get, { id: args.projectId });
    if (!project) throw new Error("project not found");
    // Real uploads bypass this entirely — artifacts come from the client's
    // Web Audio + frame-hash pipeline (see /src/lib/pipelineClient.ts and
    // /convex/analyze.ts). Only demo / url / sample sources fall through.
    if (project.source === "upload") {
      return;
    }

    const now = Date.now();
    const runId = await ctx.runMutation(api.pipelineHelpers._createRun, {
      projectId: args.projectId,
      startedAt: now,
      activeStage: STAGES[0].label,
      overallProgress: 0,
      demoMode: true,
      llmMode: "deterministic",
    });

    await ctx.runMutation(api.projects.setStatus, {
      id: args.projectId,
      status: "processing",
      progress: 1,
    });

    // Project-aware seed: same project always produces the same artifacts,
    // but different projects produce different artifacts.
    const seed = strHash(`${project.title}|${project.persona ?? ""}|${project.durationSec}`);

    let progress = 0;
    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      await ctx.runMutation(api.pipelineHelpers._appendLog, {
        projectId: args.projectId,
        runId,
        stage: stage.key,
        level: "info",
        message: `▶ ${stage.label} · starting`,
        ts: Date.now(),
      });

      const ticks = 6;
      for (let t = 0; t < ticks; t++) {
        await sleep(stage.durationMs / ticks);
        progress += (stage.weight / 100) * (1 / ticks) * 100;
        await ctx.runMutation(api.pipelineHelpers._tickProgress, {
          runId,
          projectId: args.projectId,
          activeStage: stage.label,
          overallProgress: Math.min(99, Math.round(progress)),
        });
      }

      await ctx.runMutation(api.pipelineHelpers._appendLog, {
        projectId: args.projectId,
        runId,
        stage: stage.key,
        level: "ok",
        message: `✓ ${stage.label} · complete`,
        ts: Date.now(),
      });
    }

    const clips = pickClips(project.durationSec, seed, args.projectId);
    const shorts = pickShorts(project.durationSec, seed, args.projectId);
    const chapters = pickChapters(project.durationSec, seed, args.projectId);
    const cuts = pickCuts(project.durationSec, seed, args.projectId);

    await ctx.runMutation(api.pipelineHelpers._writeArtifacts, {
      projectId: args.projectId,
      clips: [...clips, ...shorts, ...chapters, ...cuts],
    });

    // ---- Real LLM narrative (Groq) when GROQ_API_KEY is present; pool fallback otherwise.
    let llmMode: "real" | "deterministic" = "deterministic";
    let llmProvider: string | null = null;
    let llmTitles: ReturnType<typeof pickTitles> | null = null;
    let llmHeadlines: ReturnType<typeof pickHeadlines> | null = null;

    try {
      // Rough scene-change + silence heuristics for the LLM prompt. Demo /
      // url sources don't have real metrics, so we fall back to deterministic
      // estimates derived from duration. The LLM still gets *some* signal.
      const roughScenes = Math.max(
        4,
        Math.min(180, Math.round(project.durationSec / 240)),
      );
      const roughSilences = Math.round(project.durationSec / 90);
      const roughPeakRms = 0.7;
      const roughMeanRms = 0.35;
      const llmResult = await ctx.runAction(api.llm.generateNarrative, {
        title: project.title,
        persona: project.persona ?? "long-form",
        durationSec: project.durationSec,
        scenesDetected: roughScenes,
        silencesCount: roughSilences,
        peakRms: roughPeakRms,
        meanRms: roughMeanRms,
      });
      if (llmResult.ok && llmResult.mode === "real" && llmResult.payload) {
        llmMode = "real";
        llmProvider = llmResult.provider;
        llmTitles = llmResult.payload.titles.map((t) => t.body);
        llmHeadlines = llmResult.payload.headlines.map((h) => ({
          headline: h.headline,
          sub: h.subtext,
        }));
      }
    } catch (e) {
      console.warn("[pipeline] LLM narrative failed, using deterministic pool:", e);
    }

    const titleBodies = (llmTitles ?? pickTitles(seed, project.title)).slice(0, 5);
    const titles = titleBodies.map((body, i) => ({
      projectId: args.projectId,
      label: (llmTitles
        ? ["YouTube Title", "TikTok Caption", "X Hook", "LinkedIn Title", "Newsletter Subject"][i]
        : ["YouTube Title", "TikTok Caption", "X Hook", "LinkedIn Title", "Newsletter Subject"][i]),
      body,
      score: Math.round((0.55 + (i / 10)) * 100) / 100,
      style: llmTitles
        ? ["data-driven", "clickbait", "matter-of-fact", "story", "curiosity"][i]
        : ["plain", "clickbait", "matter-of-fact", "story", "curiosity"][i],
    }));
    await ctx.runMutation(api.pipelineHelpers._writeTitles, {
      projectId: args.projectId,
      titles,
    });

    const headlines = (llmHeadlines ?? pickHeadlines(seed, project.title)).slice(0, 5);
    const thumbs = headlines.map((h, i) => ({
      projectId: args.projectId,
      headline: h.headline,
      subtext: h.sub,
      palette: ["cyan-magenta", "violet-amber", "cyan-lime", "amber-magenta", "cyan-lab"][i],
      score: Math.round((0.55 + (i / 10)) * 100) / 100,
    }));
    await ctx.runMutation(api.pipelineHelpers._writeThumbnails, {
      projectId: args.projectId,
      thumbnails: thumbs,
    });

    const captions = pickCaptions(project.durationSec, seed).map((c) => ({
      ...c,
      projectId: args.projectId,
    }));
    await ctx.runMutation(api.pipelineHelpers._writeCaptions, {
      projectId: args.projectId,
      captions,
    });

    await ctx.runMutation(api.pipelineHelpers._finishRun, {
      runId,
      projectId: args.projectId,
      activeStage: "QC · Quality Assurance",
      overallProgress: 100,
      llmMode,
      llmProvider: llmProvider ?? undefined,
    });

    await ctx.runMutation(api.projects.setStatus, {
      id: args.projectId,
      status: "ready",
      progress: 100,
      summary: `${project.durationSec >= 3600
        ? `${Math.round(project.durationSec / 3600)}-hour`
        : `${Math.round(project.durationSec / 60)}-minute`
      } recording · ${clips.length} highlights · ${shorts.length} shorts · ${chapters.length} chapters · ${cuts.length} auto-cuts`,
    });
  },
});
