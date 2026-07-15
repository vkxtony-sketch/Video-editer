// Real audio waveform — fetches an audio track (e.g. from a blob: URL),
// decodes it via OfflineAudioContext, downsamples to N peak-pair bins, and
// offers a pure canvas-draw helper that respects a playhead ratio.
//
// Pure helpers (computePeaks, drawWaveform) are exported and unit-tested.

export type Waveform = {
  peaks: Float32Array; // length = bins * 2: alternating [min, max]
  sampleRate: number;
  durationSec: number;
};

const MAX_SECONDS = 30 * 60; // 30 min cap so we don't OOM
const DECODE_RATE = 22050;

/**
 * Fetch audio from a URL, decode it, and return a peak-pair waveform.
 * Returns null on failure (caller can fall back to empty UI).
 */
export async function computeWaveformFromUrl(
  url: string,
  bins = 512,
): Promise<Waveform | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(
      1,
      Math.min(arr.byteLength, DECODE_RATE * MAX_SECONDS),
      DECODE_RATE,
    );
    const buf = await ctx.decodeAudioData(arr.slice(0));
    return {
      peaks: computePeaks(buf, bins),
      sampleRate: buf.sampleRate,
      durationSec: buf.duration,
    };
  } catch (e) {
    console.warn("waveform: decode failed", e);
    return null;
  }
}

/**
 * Pure helper — downsample an AudioBuffer to N peak-pair bins.
 * Each bin's slots are the min and max of the audio samples in that range.
 * - Returns length-0 when there are no channels or no bins requested.
 * - Returns a pre-allocated, all-zeros array of length 2*bins when the
 *   buffer has channels but no samples yet (common pre-decode state).
 */
export function computePeaks(buf: AudioBuffer, bins: number): Float32Array {
  if (bins <= 0 || buf.numberOfChannels === 0) return new Float32Array(0);
  const out = new Float32Array(bins * 2);
  const channel = buf.getChannelData(0);
  if (channel.length === 0) return out;
  const samplesPerBin = Math.max(1, Math.floor(channel.length / bins));
  for (let b = 0; b < bins; b++) {
    const start = b * samplesPerBin;
    const end = Math.min(channel.length, start + samplesPerBin);
    // Initialize from the first sample so all-positive / all-negative
    // signals don't preserve the bogus default of 0.
    let mn = channel[start];
    let mx = channel[start];
    for (let i = start + 1; i < end; i++) {
      const v = channel[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[b * 2] = mn;
    out[b * 2 + 1] = mx;
  }
  return out;
}

/**
 * Pure helper — draw a peak-pair waveform onto an existing 2D context.
 * Highlights past-the-playhead bins in cyan, future bins in muted grey.
 * No-op when peaks is empty or the canvas has zero dimensions — does not
 * call clearRect so a partial overlay remains intact.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  width: number,
  height: number,
  playheadRatio = 0,
  options: { pastColor?: string; futureColor?: string; bg?: string } = {},
): void {
  const bins = peaks.length / 2;
  if (bins === 0 || width <= 0 || height <= 0) return;
  const { pastColor = "rgba(0, 243, 255, 0.95)", futureColor = "rgba(160, 160, 160, 0.35)", bg } = options;
  ctx.clearRect(0, 0, width, height);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  const barWidth = Math.max(1, width / bins);
  const centerY = height / 2;
  const playheadX = Math.max(0, Math.min(1, playheadRatio)) * width;
  // Mid line
  ctx.strokeStyle = "rgba(120, 120, 120, 0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  for (let b = 0; b < bins; b++) {
    const min = peaks[b * 2];
    const max = peaks[b * 2 + 1];
    const x = b * barWidth;
    const span = Math.max(1, ((max - min) / 2) * height * 0.92);
    ctx.fillStyle = x < playheadX ? pastColor : futureColor;
    ctx.fillRect(x, centerY - span / 2, Math.max(1, barWidth - 0.5), span);
  }
}
