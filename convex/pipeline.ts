"use node";
// Demo-grade AI pipeline. Marked "use node" so it runs server-side in Convex
// and so we can later swap in real calls (Whisper / LLM / CV) without changing
// the UI surface area. Heavy compute is NOT performed here — this stages
// progress, then writes richly-seeded mock artifacts that look like real
// analysis. Real model calling is left as a follow-up that the user can wire
// through Convex action environment variables.

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
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function pickTitles(): string[] {
  return [
    "The single line that changed how I think about this",
    "Why everything you’ve heard about this is wrong",
    "The 90-second version nobody will tell you about",
    "I tried this for 30 days. Here’s the data.",
    "Three things I wish I knew before starting",
    "Stop doing this immediately",
    "The whole story in five minutes",
    "What I learned shipping this to a million people",
    "The cleanest explanation I can give",
  ];
}

function pickHedlines(): { headline: string; sub: string }[] {
  return [
    { headline: "It actually works.", sub: "and here’s the receipts" },
    { headline: "The whole story.", sub: "in under 5 minutes" },
    { headline: "Don't scroll past this.", sub: "what nobody tells you" },
    { headline: "I was wrong about this.", sub: "until I tried it" },
    { headline: "Quietly life-changing.", sub: "watch till the end" },
    { headline: "Twenty-four hours → five minutes.", sub: "AI did this" },
  ];
}

function pickCaptions(durationSec: number): {
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
  sentiment: string;
}[] {
  const sample = [
    { s: "Speaker A", text: "Alright let me just dive in.", sentiment: "neutral" },
    { s: "Speaker A", text: "So here’s the thing — nobody talks about this.", sentiment: "curious" },
    { s: "Speaker A", text: "I tried it for thirty days.", sentiment: "calm" },
    { s: "Speaker A", text: "And the result kind of broke my brain.", sentiment: "surprised" },
    { s: "Speaker A", text: "Wait — hold on — let me back up.", sentiment: "nervous" },
    { s: "Speaker A", text: "So the first thing you need to know is…", sentiment: "calm" },
    { s: "Speaker A", text: "Most people get this fundamentally wrong.", sentiment: "intense" },
    { s: "Speaker A", text: "You don’t need to spend money, you don’t need to grind.", sentiment: "calm" },
    { s: "Speaker A", text: "But you DO need to do this one thing every single day.", sentiment: "intense" },
    { s: "Speaker A", text: "If you take one thing away — let it be that.", sentiment: "warm" },
    { s: "Speaker A", text: "Alright so let me show you exactly how I do it.", sentiment: "calm" },
  ];
  const rand = seedrand(durationSec + 17);
  const out: {
    startSec: number;
    endSec: number;
    speaker: string;
    text: string;
    sentiment: string;
  }[] = [];
  let t = 60 + rand() * 90;
  for (let i = 0; i < 28; i++) {
    const line = sample[Math.floor(rand() * sample.length)];
    const dur = 4 + rand() * 7;
    out.push({
      startSec: Math.floor(t),
      endSec: Math.floor(t + dur),
      speaker: line.s,
      text: line.text,
      sentiment: line.sentiment,
    });
    t += dur + (0.2 + rand() * 1.2);
  }
  return out;
}

function pickClips(durationSec: number) {
  const rand = seedrand(durationSec + 5);
  const titles = pickTitles();
  const tags = [
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
  const total = 12;
  const out = [];
  for (let i = 0; i < total; i++) {
    const start = Math.floor(120 + rand() * Math.max(120, durationSec - 240));
    const len = Math.floor(40 + rand() * 220);
    out.push({
      projectId: undefined as unknown as string,
      kind: "highlight" as const,
      title: titles[i % titles.length],
      startSec: start,
      endSec: start + len,
      score: Math.round((0.55 + rand() * 0.45) * 100) / 100,
      rationale:
        rand() > 0.5
          ? "Strong narrative payoff, high energy delta, faces present."
          : "Quantified hook + retention signal; ideal short candidate.",
      tags: [tags[i % tags.length], tags[(i + 3) % tags.length]],
      createdAt: Date.now(),
    });
  }
  return out;
}

function pickShorts(durationSec: number) {
  const rand = seedrand(durationSec + 11);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const start = Math.floor(180 + rand() * Math.max(180, durationSec - 360));
    const len = 20 + Math.floor(rand() * 70);
    out.push({
      projectId: undefined as unknown as string,
      kind: "short" as const,
      title: ["POV:", "Wait for it…", "Watch this part only.", "Listen closely.",
        "This one line.", "Don't skip this.", "The ending.", "60-second version."
      ][i],
      startSec: start,
      endSec: start + len,
      score: Math.round((0.6 + rand() * 0.4) * 100) / 100,
      rationale: "Vertical-native hook with face-tracked speaker and crisp CTA moments.",
      tags: ["vertical", "short-form", "viral"],
      createdAt: Date.now(),
    });
  }
  return out;
}

function pickChapters(durationSec: number) {
  if (durationSec < 600) return [];
  const rand = seedrand(durationSec + 23);
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
      projectId: undefined as unknown as string,
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

function pickCuts(durationSec: number) {
  const rand = seedrand(durationSec + 41);
  const out = [];
  const count = Math.min(60, Math.max(8, Math.floor(durationSec / 360)));
  let t = 30;
  for (let i = 0; i < count; i++) {
    const dur = 1 + Math.floor(rand() * 6);
    out.push({
      projectId: undefined as unknown as string,
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

    const now = Date.now();
    const runId = await ctx.runMutation(api.pipelineHelpers._createRun, {
      projectId: args.projectId,
      startedAt: now,
      activeStage: STAGES[0].label,
      overallProgress: 0,
      demoMode: true,
    });

    await ctx.runMutation(api.projects.setStatus, {
      id: args.projectId,
      status: "processing",
      progress: 1,
    });

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

      // Simulate work — chunked for visible progress
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

    const projectIdStr = args.projectId;
    const clips = pickClips(project.durationSec).map((c) => ({ ...c, projectId: projectIdStr }));
    const shorts = pickShorts(project.durationSec).map((c) => ({ ...c, projectId: projectIdStr }));
    const chapters = pickChapters(project.durationSec).map((c) => ({ ...c, projectId: projectIdStr }));
    const cuts = pickCuts(project.durationSec).map((c) => ({ ...c, projectId: projectIdStr }));

    try { void clips; } catch (_) { /* no-op */ }

    await ctx.runMutation(api.pipelineHelpers._writeArtifacts, {
      projectId: args.projectId,
      clips: [...clips, ...shorts, ...chapters, ...cuts],
    });

    const titles = pickTitles().slice(0, 5).map((body, i) => ({
      projectId: args.projectId,
      label: ["YouTube Title", "TikTok Caption", "X Hook", "LinkedIn Title", "Newsletter Subject"][i],
      body,
      score: Math.round((0.55 + (i / 10)) * 100) / 100,
      style: ["plain", "clickbait", "matter-of-fact", "story", "curiosity"][i],
    }));
    await ctx.runMutation(api.pipelineHelpers._writeTitles, {
      projectId: args.projectId,
      titles,
    });

    const thumbs = pickHedlines().map((h, i) => ({
      projectId: args.projectId,
      headline: h.headline,
      subtext: h.sub,
      palette: ["cyan-magenta", "violet-amber", "cyan-lime", "amber-magenta", "cyan-lab", "violet"][i],
      score: Math.round((0.55 + (i / 10)) * 100) / 100,
    }));
    await ctx.runMutation(api.pipelineHelpers._writeThumbnails, {
      projectId: args.projectId,
      thumbnails: thumbs,
    });

    const captions = pickCaptions(project.durationSec).map((c) => ({
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
