// Real audio silence detection using the Web Audio API.
//
// Pure function — takes an `AudioBuffer` (already decoded by the caller) and
// returns an array of detected silence regions as cuts. The caller is
// responsible for fetching the source audio (e.g. via fetch(blobUrl) +
// AudioContext.decodeAudioData), but this module is testable in isolation by
// passing a synthetic AudioBuffer (see `src/test/silenceDetect.test.ts`).

export type DetectedCut = {
  startSec: number;
  endSec: number;
  /** "long-dead" ≥ 3s, "micro" < 3s */
  kind: "long-dead" | "micro";
  /** RMS dBFS of the silence window — useful for UI */
  avgDb: number;
};

export type SilenceDetectOpts = {
  /** Window size in ms for RMS analysis. Default 50ms. */
  windowMs?: number;
  /** Anything quieter than this (dBFS) is treated as silence. Default -40 dBFS. */
  silenceThresholdDb?: number;
  /** Max seconds to scan (cap input length for memory safety). Default 1800s. */
  maxSeconds?: number;
  /** Skip the first N seconds (e.g. fade-in / logo). Default 0. */
  skipStartSec?: number;
};

export const DEFAULTS: Required<SilenceDetectOpts> = {
  windowMs: 50,
  silenceThresholdDb: -40,
  maxSeconds: 1800,
  skipStartSec: 0,
};

/** Compute RMS of an audio channel slice [start, end). */
export function rmsOfRange(channel: Float32Array, start: number, end: number): number {
  let sumSq = 0;
  let n = 0;
  for (let i = start; i < end && i < channel.length; i++) {
    const v = channel[i];
    sumSq += v * v;
    n++;
  }
  if (n === 0) return 0;
  return Math.sqrt(sumSq / n);
}

/** Convert linear amplitude (0..1) to dBFS. Returns -Infinity for 0. */
export function toDbfs(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/**
 * Detect silence regions in an AudioBuffer. Returns merged silence cuts.
 * Pure — does not touch the network or DOM.
 */
export function detectSilence(
  buffer: AudioBuffer,
  opts: SilenceDetectOpts = {},
): DetectedCut[] {
  const cfg = { ...DEFAULTS, ...opts };
  if (buffer.numberOfChannels === 0) return [];

  // Use the first channel (sufficient for speech-heavy content; we can later
  // average across channels for better results).
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSamples = Math.max(
    1,
    Math.floor((cfg.windowMs / 1000) * sampleRate),
  );
  const totalSamples = Math.min(channel.length, Math.floor(cfg.maxSeconds * sampleRate));
  const startSample = Math.floor(cfg.skipStartSec * sampleRate);

  // Walk the buffer in fixed-size windows. Track an in-progress run of
  // consecutive silent windows so we can flush a single cut per run.
  let runStart: number | null = null;
  let runEnd = 0;
  let runSumDb = 0;
  let runCount = 0;
  const silentRuns: { start: number; end: number; sumDb: number; count: number }[] = [];

  for (let i = startSample; i + windowSamples <= totalSamples; i += windowSamples) {
    const rms = rmsOfRange(channel, i, i + windowSamples);
    const db = toDbfs(rms);
    const isSilent = db < cfg.silenceThresholdDb; // NaN comparisons → false, so NaN is treated as not-silent
    const endSample = Math.min(i + windowSamples, totalSamples);
    if (isSilent) {
      if (runStart === null) runStart = i;
      runEnd = endSample;
      runSumDb += db;
      runCount++;
    } else if (runStart !== null) {
      silentRuns.push({ start: runStart, end: runEnd, sumDb: runSumDb, count: runCount });
      runStart = null;
      runSumDb = 0;
      runCount = 0;
    }
  }
  if (runStart !== null) {
    silentRuns.push({ start: runStart, end: runEnd, sumDb: runSumDb, count: runCount });
  }

  // Translate silent runs to seconds and classify.
  const cuts: DetectedCut[] = [];
  for (const r of silentRuns) {
    const startSec = r.start / sampleRate;
    const endSec = r.end / sampleRate;
    const durMs = (endSec - startSec) * 1000;
    if (durMs < 200) continue; // ignore sub-200ms blips
    const avgDb = r.count > 0 ? r.sumDb / r.count : -Infinity;
    cuts.push({
      startSec,
      endSec,
      kind: durMs >= 3000 ? "long-dead" : "micro",
      avgDb: Math.round(avgDb * 10) / 10,
    });
  }
  return cuts;
}

/**
 * Fetch the audio from a blob URL, decode it, run detection, and clean up.
 * Returns `[]` on failure (caller should fall back gracefully).
 */
export async function detectSilenceFromUrl(
  url: string,
  opts: SilenceDetectOpts = {},
): Promise<DetectedCut[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const arr = await res.arrayBuffer();
    // Use an OfflineAudioContext with reasonable limits so we don't OOM on
    // huge files. The browser will downmix/sample as needed.
    const ctx = new OfflineAudioContext(1, Math.min(arr.byteLength, 44100 * 60 * 5), 44100);
    const buf = await ctx.decodeAudioData(arr.slice(0));
    return detectSilence(buf, opts);
  } catch (e) {
    console.warn("silenceDetect: decode failed", e);
    return [];
  }
}
