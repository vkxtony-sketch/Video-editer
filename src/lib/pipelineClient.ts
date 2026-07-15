// Client-side pipeline orchestrator. Given a real video File (or blob URL),
// runs Web Audio + frame-hash analysis in the browser, builds Convex-shaped
// artifacts from the REAL metrics, then ingests them via the
// `analyze:ingestAnalysis` mutation.
//
// This replaces the seeded mock pipeline in `convex/pipeline.ts` for upload
// source. Demo + url sources still fall through to `runPipeline`.

import { analyzeAudio, findEnergyPeaks, type AudioAnalysis, type AudioSilence } from "./audioAnalysis";
import { analyzeVideo, type VideoAnalysis, type SceneChange } from "./videoAnalysis";

export type AnalysisProgress =
  | { stage: "audio-decode"; frac: number }
  | { stage: "audio-rms"; frac: number }
  | { stage: "video-sample"; frac: number }
  | { stage: "build-artifacts"; frac: number }
  | { stage: "ingest"; frac: number };

export type ClipArtifact = {
  projectId: string;
  kind: "highlight" | "short" | "chapter" | "cut";
  title: string;
  startSec: number;
  endSec: number;
  score: number;
  rationale: string;
  tags: string[];
  createdAt: number;
};

export type TitleArtifact = {
  projectId: string;
  label: string;
  body: string;
  score: number;
  style: string;
};

export type ThumbArtifact = {
  projectId: string;
  headline: string;
  subtext: string;
  palette: string;
  score: number;
};

export type CaptionArtifact = {
  projectId: string;
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
  sentiment: string;
};

export type AnalysisArtifacts = {
  clips: ClipArtifact[];
  titles: TitleArtifact[];
  thumbnails: ThumbArtifact[];
  captions: CaptionArtifact[];
  metrics: {
    durationSec: number;
    scenesDetected: number;
    silences: AudioSilence[];
    peakRms: number;
    meanRms: number;
    avgSceneDistance: number;
  };
};

export async function analyzeAndIngest(opts: {
  file: File;
  projectId: string;
  title: string;
  persona: string;
  ownerId: string;
  ingest: (artifacts: AnalysisArtifacts) => Promise<void>;
  onProgress?: (p: AnalysisProgress) => void;
}): Promise<AnalysisArtifacts> {
  const url = URL.createObjectURL(opts.file);
  try {
    // Stage 1: audio
    opts.onProgress?.({ stage: "audio-decode", frac: 0 });
    const audio: AudioAnalysis = await analyzeAudio(url, (frac) => {
      opts.onProgress?.({ stage: "audio-decode", frac });
    });
    opts.onProgress?.({ stage: "audio-rms", frac: 1 });

    // Stage 2: video
    opts.onProgress?.({ stage: "video-sample", frac: 0 });
    const video: VideoAnalysis = await analyzeVideo(
      url,
      Math.max(audio.durationSec, opts.file.size ? 0 : audio.durationSec),
      (frac) => {
        opts.onProgress?.({ stage: "video-sample", frac });
      },
    );

    // Stage 3: build artifacts from REAL data
    opts.onProgress?.({ stage: "build-artifacts", frac: 0 });
    const artifacts = buildArtifacts({
      projectId: opts.projectId,
      audio,
      video,
      title: opts.title,
      persona: opts.persona,
    });
    opts.onProgress?.({ stage: "build-artifacts", frac: 1 });

    // Stage 4: ingest
    opts.onProgress?.({ stage: "ingest", frac: 0 });
    await opts.ingest(artifacts);
    opts.onProgress?.({ stage: "ingest", frac: 1 });

    return artifacts;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildArtifacts(opts: {
  projectId: string;
  audio: AudioAnalysis;
  video: VideoAnalysis;
  title: string;
  persona: string;
}): AnalysisArtifacts {
  const { audio, video, title, persona } = opts;
  const projectId = opts.projectId;

  // ---- Highlights: real energy peaks + nearby scene changes ----
  const peakWindows = findEnergyPeaks(audio.bins, audio.durationSec, 6, 45);
  const highlightScores = new Map<number, number>();
  for (const w of peakWindows) {
    const sceneCount = video.sceneChanges.filter(
      (s) => s.tSec >= w.startSec && s.tSec <= w.endSec,
    ).length;
    const score = Math.min(1, w.score * 0.7 + sceneCount * 0.06);
    highlightScores.set(
      Math.floor((w.startSec + w.endSec) / 2),
      Math.round(score * 100) / 100,
    );
  }
  const clips: ClipArtifact[] = [];
  for (const [center, score] of highlightScores) {
    const half = 22; // 45-sec window
    const startSec = Math.max(0, center - half);
    const endSec = Math.min(audio.durationSec, center + half);
    const sceneCount = video.sceneChanges.filter(
      (s) => s.tSec >= startSec && s.tSec <= endSec,
    ).length;
    clips.push({
      projectId,
      kind: "highlight",
      title: peakTitle(title, score, sceneCount),
      startSec,
      endSec,
      score,
      rationale: `Peak RMS ${(score * 100).toFixed(0)}% · ${sceneCount} scene change${sceneCount === 1 ? "" : "s"} detected`,
      tags: sceneCount > 0 ? ["energy-peak", "scene-change"] : ["energy-peak"],
      createdAt: Date.now(),
    });
  }
  // Stable order: by score desc
  clips.sort((a, b) => b.score - a.score);

  // ---- Shorts: 30-second clips centered on the most intense energy peaks ----
  const shortSeeds = findEnergyPeaks(audio.bins, audio.durationSec, 6, 60);
  for (const seed of shortSeeds.slice(0, 6)) {
    const half = 15;
    const startSec = Math.max(0, seed.startSec + Math.floor((seed.endSec - seed.startSec) / 2) - half);
    const endSec = Math.min(audio.durationSec, startSec + 30);
    clips.push({
      projectId,
      kind: "short",
      title: shortTitle(title),
      startSec,
      endSec,
      score: Math.round(seed.score * 100) / 100,
      rationale: "Vertical-native clip extracted from the loudest 30s in the file",
      tags: ["vertical", "short-form", "real"],
      createdAt: Date.now(),
    });
  }

  // ---- Chapters: segment the file by detected scene changes ----
  if (video.sceneChanges.length >= 1) {
    const chapterMarks = pickChapterMarks(video.sceneChanges, audio.durationSec);
    for (let i = 0; i < chapterMarks.length; i++) {
      const startSec = chapterMarks[i];
      const endSec = i + 1 < chapterMarks.length ? chapterMarks[i + 1] - 1 : audio.durationSec;
      const segStartBin = Math.max(0, Math.floor(startSec));
      const segEndBin = Math.min(audio.bins.length - 1, Math.floor(endSec));
      const segRms =
        audio.bins.slice(segStartBin, segEndBin + 1).reduce((s, b) => s + b.rms, 0) /
        Math.max(1, segEndBin - segStartBin + 1);
      clips.push({
        projectId,
        kind: "chapter",
        title: chapterLabel(i, segRms, persona),
        startSec,
        endSec,
        score: 0,
        rationale: `Scene change detected at ${formatClock(startSec)}`,
        tags: ["chapter"],
        createdAt: Date.now(),
      });
    }
  }

  // ---- Cuts: silence detection ----
  for (const sil of audio.silences) {
    clips.push({
      projectId,
      kind: "cut",
      title: sil.kind === "dead" ? "Long dead pause" : "Micro-pause",
      startSec: sil.startSec,
      endSec: sil.endSec,
      score: 1 - Math.min(1, (sil.endSec - sil.startSec) / 8),
      rationale:
        sil.kind === "dead"
          ? `${sil.endSec - sil.startSec}s of silence below RMS 2% — safe to cut`
          : `${sil.endSec - sil.startSec}s micro-pause`,
      tags: ["auto-cut", sil.kind === "dead" ? "dead-air" : "filler"],
      createdAt: Date.now(),
    });
  }

  // ---- Captions: real energy/silence descriptors ----
  const captions: CaptionArtifact[] = [];
  let cursor = 0;
  for (const sil of audio.silences) {
    if (sil.startSec > cursor) {
      const segStart = cursor;
      const segEnd = sil.startSec;
      const segRms = avgBins(audio.bins, segStart, segEnd);
      const segZcr = avgZcr(audio.bins, segStart, segEnd);
      captions.push({
        projectId,
        startSec: segStart,
        endSec: segEnd,
        speaker: segZcr > 0.06 ? "Speaker A" : "Background",
        text: captionLine(segRms, segZcr, persona),
        sentiment: sentimentFor(segRms),
      });
    }
    if (sil.kind === "dead") {
      captions.push({
        projectId,
        startSec: sil.startSec,
        endSec: sil.endSec,
        speaker: "Silence",
        text: `[ Silence · ${(sil.endSec - sil.startSec).toFixed(1)}s ]`,
        sentiment: "neutral",
      });
    }
    cursor = sil.endSec;
  }
  if (cursor < audio.durationSec) {
    const segRms = avgBins(audio.bins, cursor, audio.durationSec);
    const segZcr = avgZcr(audio.bins, cursor, audio.durationSec);
    captions.push({
      projectId,
      startSec: cursor,
      endSec: audio.durationSec,
      speaker: segZcr > 0.06 ? "Speaker A" : "Background",
      text: captionLine(segRms, segZcr, persona),
      sentiment: sentimentFor(segRms),
    });
  }
  // Cap captions to ~30 to keep the UI readable
  const captionSlice = captions.slice(0, 30);

  // ---- Titles: real metrics ----
  const topPeak = peakWindows[0];
  const titles: TitleArtifact[] = [
    {
      projectId,
      label: "YouTube Title",
      body: topPeak
        ? `The loudest ${topPeak.endSec - topPeak.startSec}s starts at ${formatClock(topPeak.startSec)}`
        : `A ${formatClock(audio.durationSec)} take on ${topic(title)}`,
      score: 0.9,
      style: "data-driven",
    },
    {
      projectId,
      label: "TikTok Caption",
      body: `${video.sceneChanges.length} scene shifts in ${formatClock(audio.durationSec)} — the ${topPeak ? formatClock(topPeak.startSec) : "first"} one is the loudest`,
      score: 0.82,
      style: "data-driven",
    },
    {
      projectId,
      label: "X Hook",
      body: `I ran the audio analysis on ${topic(title)}. ${audio.silences.length} silent gap${audio.silences.length === 1 ? "" : "s"}. Peak RMS ${(audio.peakRms * 100).toFixed(0)}%.`,
      score: 0.78,
      style: "data-driven",
    },
    {
      projectId,
      label: "LinkedIn Title",
      body: `${formatClock(audio.durationSec)} on ${topic(title)} · ${video.sceneChanges.length} visual shifts · ${audio.silences.length} cuts`,
      score: 0.71,
      style: "professional",
    },
    {
      projectId,
      label: "Newsletter Subject",
      body: `What ${video.sceneChanges.length} scene changes in ${topic(title)} tell us`,
      score: 0.66,
      style: "curiosity",
    },
  ];

  // ---- Thumbnails: metrics-driven palettes (always present, but data-linked) ----
  const thumbnails: ThumbArtifact[] = [
    {
      projectId,
      headline: `${video.sceneChanges.length} visual shifts.`,
      subtext: `${formatClock(audio.durationSec)} analyzed`,
      palette: audio.meanRms > 0.3 ? "amber-magenta" : "cyan-magenta",
      score: 0.88,
    },
    {
      projectId,
      headline: `Peak at ${formatClock(topPeak?.startSec ?? 0)}.`,
      subtext: `${Math.round((audio.peakRms || 0) * 100)}% RMS loudest moment`,
      palette: "violet-amber",
      score: 0.82,
    },
    {
      projectId,
      headline: `${audio.silences.filter((s) => s.kind === "dead").length} dead-air gaps.`,
      subtext: "Auto-editable · fill or trim",
      palette: "cyan-lime",
      score: 0.74,
    },
    {
      projectId,
      headline: topic(title).split(" ").slice(0, 2).join(" "),
      subtext: "What the data says",
      palette: "cyan-lab",
      score: 0.7,
    },
    {
      projectId,
      headline: persona || "Source analysis",
      subtext: `${video.sceneChanges.length} scene cuts mapped`,
      palette: "cyan-magenta",
      score: 0.65,
    },
  ];

  return {
    clips,
    titles,
    thumbnails,
    captions: captionSlice,
    metrics: {
      durationSec: audio.durationSec,
      scenesDetected: video.sceneChanges.length,
      silences: audio.silences,
      peakRms: audio.peakRms,
      meanRms: audio.meanRms,
      avgSceneDistance: video.sceneChanges.length
        ? video.sceneChanges.reduce((s, c) => s + c.distance, 0) / video.sceneChanges.length
        : 0,
    },
  };
}

// -------------------- helpers --------------------

function avgBins(bins: AudioAnalysis["bins"], start: number, end: number): number {
  const a = Math.max(0, Math.floor(start));
  const b = Math.min(bins.length - 1, Math.floor(end));
  if (b < a) return 0;
  let s = 0;
  for (let i = a; i <= b; i++) s += bins[i].rms;
  return s / (b - a + 1);
}

function avgZcr(bins: AudioAnalysis["bins"], start: number, end: number): number {
  const a = Math.max(0, Math.floor(start));
  const b = Math.min(bins.length - 1, Math.floor(end));
  if (b < a) return 0;
  let s = 0;
  for (let i = a; i <= b; i++) s += bins[i].zcr;
  return s / (b - a + 1);
}

function pickChapterMarks(changes: SceneChange[], duration: number): number[] {
  // Want 3–7 chapters. Use every Nth change.
  const target = Math.max(3, Math.min(7, Math.floor(duration / 600) + 3));
  const step = Math.max(1, Math.floor(changes.length / target));
  const out: number[] = [0];
  for (let i = 0; i < changes.length; i += step) out.push(changes[i].tSec);
  return out;
}

function chapterLabel(idx: number, segRms: number, persona: string): string {
  if (idx === 0) return `Opening · ${persona || "source"}`;
  if (segRms > 0.5) return `Chapter ${idx + 1} · high energy`;
  if (segRms > 0.2) return `Chapter ${idx + 1} · mid energy`;
  return `Chapter ${idx + 1} · quiet beat`;
}

function peakTitle(title: string, score: number, sceneCount: number): string {
  const topicWords = topic(title).split(" ").slice(0, 3).join(" ");
  if (sceneCount >= 2) return `${topicWords} · ${sceneCount} scene shifts back-to-back`;
  if (score > 0.8) return `Loudest minute in ${topicWords}`;
  return `${topicWords} highlight`;
}

function shortTitle(title: string): string {
  const t = topic(title);
  return `POV: ${t} hits different`;
}

function captionLine(rms: number, zcr: number, persona: string): string {
  if (zcr > 0.08) return `Speech detected · RMS ${(rms * 100).toFixed(0)}%`;
  if (zcr > 0.04) return `Mixed audio · RMS ${(rms * 100).toFixed(0)}%`;
  if (rms > 0.3) return `Music or sustained tone · RMS ${(rms * 100).toFixed(0)}%`;
  if (rms > 0.05) return `Low-level ambient audio`;
  return `Quiet — possibly no source`;
}

function sentimentFor(rms: number): string {
  if (rms > 0.5) return "intense";
  if (rms > 0.25) return "calm";
  return "neutral";
}

function topic(title: string): string {
  return title
    .replace(/\.[^.]+$/, "")
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .toLowerCase() || "this clip";
}

function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
