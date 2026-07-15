// Real audio analysis using the Web Audio API. Given a blob URL, decodes the
// audio track via OfflineAudioContext, downsamples to mono, computes 1-second
// RMS bins, identifies energy peaks, marks silence cuts, and estimates a
// zero-crossing rate as a proxy for "tempo" / "speech density".

export type AudioBin = {
  startSec: number;
  rms: number; // 0..1 normalized to the loudest second in the file
  zcr: number; // zero-crossing rate (0..1) for this second
};

export type AudioSilence = {
  startSec: number;
  endSec: number;
  // "dead" = > 3s of low energy, "filler" = 0.5–2s of low energy
  kind: "dead" | "filler";
};

export type AudioAnalysis = {
  durationSec: number;
  sampleRate: number;
  peakRms: number;
  meanRms: number;
  bins: AudioBin[]; // length ~= durationSec
  silences: AudioSilence[];
};

export async function analyzeAudio(
  url: string,
  onProgress?: (frac: number) => void,
): Promise<AudioAnalysis> {
  // 1. Pull the bytes via fetch(blob:) so we can decode with OfflineAudioContext
  //    without needing the video element to "play".
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  onProgress?.(0.15);

  // 2. Decode audio data offline.
  const AC =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!AC) {
    throw new Error("OfflineAudioContext not supported in this browser.");
  }

  // Probe the file with a temporary AudioContext (any AudioContext works).
  const temp = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();
  const decoded = await temp.decodeAudioData(buf.slice(0));
  await temp.close();
  onProgress?.(0.45);

  const sampleRate = decoded.sampleRate;
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const durationSec = length / sampleRate;

  // 3. Downmix to mono.
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }

  // 4. Bin into 1-second windows and compute RMS + zero-crossings per bin.
  const binSize = Math.floor(sampleRate);
  const numBins = Math.ceil(length / binSize);
  const bins: AudioBin[] = new Array(numBins);
  let peakRms = 0;
  for (let b = 0; b < numBins; b++) {
    const start = b * binSize;
    const end = Math.min(start + binSize, length);
    let sumSq = 0;
    let zc = 0;
    let prev = mono[start] ?? 0;
    for (let i = start + 1; i < end; i++) {
      const v = mono[i];
      sumSq += v * v;
      if ((prev >= 0 && v < 0) || (prev < 0 && v >= 0)) zc++;
      prev = v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    bins[b] = {
      startSec: b,
      rms,
      zcr: zc / Math.max(1, end - start - 1),
    };
    if (rms > peakRms) peakRms = rms;
  }
  onProgress?.(0.7);

  // 5. Normalize rms 0..1 against the peak.
  if (peakRms > 0) {
    for (const bin of bins) bin.rms = bin.rms / peakRms;
  }

  // 6. Mean rms for stats.
  const meanRms = bins.reduce((s, b) => s + b.rms, 0) / Math.max(1, bins.length);

  // 7. Detect silences. Threshold tuned for normalized audio.
  const silences = detectSilences(bins, durationSec);
  onProgress?.(0.95);

  return { durationSec, sampleRate, peakRms, meanRms, bins, silences };
}

function detectSilences(bins: AudioBin[], _durationSec: number): AudioSilence[] {
  const out: AudioSilence[] = [];
  let runStart = -1;
  let runLen = 0;
  for (let i = 0; i < bins.length; i++) {
    const low = bins[i].rms < 0.02;
    if (low) {
      if (runStart < 0) runStart = i;
      runLen++;
    } else {
      if (runStart >= 0) {
        const kind: AudioSilence["kind"] =
          runLen >= 3 ? "dead" : "filler";
        out.push({ startSec: runStart, endSec: runStart + runLen, kind });
      }
      runStart = -1;
      runLen = 0;
    }
  }
  // Tail
  if (runStart >= 0) {
    const kind: AudioSilence["kind"] = runLen >= 3 ? "dead" : "filler";
    out.push({ startSec: runStart, endSec: runStart + runLen, kind });
  }
  return out;
}

/** Returns N contiguous windows centered on the top-K RMS peaks. */
export function findEnergyPeaks(
  bins: AudioBin[],
  durationSec: number,
  k: number,
  windowSec = 30,
): { startSec: number; endSec: number; score: number }[] {
  if (bins.length === 0) return [];
  const ranked = [...bins]
    .map((b, i) => ({ b, i }))
    .sort((a, b) => b.b.rms - a.b.rms);
  const chosen: { startSec: number; endSec: number; score: number }[] = [];
  const used = new Set<number>();
  for (const { b, i } of ranked) {
    if (chosen.length >= k) break;
    // Skip if overlapping with an already-chosen window
    let overlap = false;
    for (let j = Math.max(0, i - windowSec); j <= Math.min(bins.length - 1, i + windowSec); j++) {
      if (used.has(j)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;
    const start = Math.max(0, i - Math.floor(windowSec / 2));
    const end = Math.min(durationSec, start + windowSec);
    // Local RMS for scoring
    let localSum = 0;
    let localCount = 0;
    for (let j = start; j < end && j < bins.length; j++) {
      localSum += bins[j].rms;
      localCount++;
    }
    const localRms = localCount > 0 ? localSum / localCount : 0;
    for (let j = start; j < end && j < bins.length; j++) used.add(j);
    chosen.push({ startSec: start, endSec: end, score: localRms });
  }
  return chosen.sort((a, b) => b.score - a.score);
}
