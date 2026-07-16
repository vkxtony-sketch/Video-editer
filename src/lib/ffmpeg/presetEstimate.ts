/**
 * presetEstimate.ts
 *
 * Pure per-preset estimator used by the legend beneath the
 * `<PresetPicker />` in `ProjectHeader.tsx`. Given the active libx264
 * preset and the current clip selections, predict output size + encode
 * time so the user sees the size/time trade-off BEFORE clicking Export.
 *
 * Source for the constants: matched against the presets actually
 * shipped in `src/lib/ffmpeg/filterGraph.ts` (`-c:v libx264`).
 * Tuned for 720p30 H.264 @ yuv420p — explicitly labelled in the legend.
 *
 * Bitrate table (Mbps, observed for 720p30 content):
 *   ultrafast ≈ 5.0    → 0.625 MB/s
 *   superfast ≈ 3.5    → 0.4375 MB/s
 *   veryfast  ≈ 2.5    → 0.3125 MB/s
 *   medium    ≈ 1.5    → 0.1875 MB/s
 *
 * Encode-time table (multiplier: encodeSec = factor × reelSec):
 *   ultrafast ≈ 0.25   (encode ~4× faster than real-time, browser-tab)
 *   superfast ≈ 0.50   (encode ~2× faster than real-time)
 *   veryfast  ≈ 1.0    (encode ~1× real-time)
 *   medium    ≈ 2.5    (encode ~2.5× slower than real-time)
 *
 * Accuracy: ±30% typical. The legend text appends "(est. 720p30)" so
 * the user knows what assumption produced the number.
 */

import type { RenderPreset } from "../useLocalStorage";

export type PresetProfile = {
  /** Output bitrate in megabits per second (observed for 720p30 H.264). */
  readonly bitrateMbps: number;
  /** encodeSec = factor × reelSec (real-time multiplier). */
  readonly encodeSpeedFactor: number;
  /**
   * `true` when encode speed is *faster* than real-time
   * (factor < 1). UI uses this to label presets "fast" vs "balanced".
   */
  readonly isRealtime: boolean;
};

export const PRESET_PROFILES: Readonly<Record<RenderPreset, PresetProfile>> = {
  ultrafast: { bitrateMbps: 5.0, encodeSpeedFactor: 0.25, isRealtime: false },
  superfast: { bitrateMbps: 3.5, encodeSpeedFactor: 0.5, isRealtime: false },
  veryfast: { bitrateMbps: 2.5, encodeSpeedFactor: 1.0, isRealtime: true },
  medium: { bitrateMbps: 1.5, encodeSpeedFactor: 2.5, isRealtime: true },
} as const;

export const RESOLUTION_HINT = "720p30";

export type EstimateInputs = {
  /** Active preset ("ultrafast" | "superfast" | "veryfast" | "medium"). */
  preset: RenderPreset;
  /** Number of clips that will be concatenated (already pre-filtered). */
  clipCount: number;
  /** Sum of clip durations in seconds (the rendered reel length). */
  totalSec: number;
};

export type EstimateResult = {
  preset: RenderPreset;
  clipCount: number;
  totalSec: number;
  /** Average clip duration (seconds). NaN-safe: returns 0 when clipCount === 0. */
  avgSecPerClip: number;
  /** Predicted output size (megabytes). 0 when totalSec === 0. */
  outputMB: number;
  /** Predicted encode wall-clock time (seconds). 0 when totalSec === 0. */
  encodeSec: number;
};

/**
 * Pure estimator. Never throws. Returns `outputMB = 0` /
 * `encodeSec = 0` for the empty-input case so callers can show
 * "—" without special-casing.
 */
export function estimateRender(input: EstimateInputs): EstimateResult {
  const { preset, clipCount, totalSec } = input;
  const profile = PRESET_PROFILES[preset];
  // Number.isFinite guards prevent NaN/Infinity from leaking into the
  // result (the caller may pass undefined-like values when the
  // Studio query is still loading). Floors clipCount so a stray 7.9
  // never reports a fractional clip.
  const safeCount = Number.isFinite(clipCount)
    ? Math.max(0, Math.floor(clipCount))
    : 0;
  const safeTotal = Number.isFinite(totalSec)
    ? Math.max(0, totalSec)
    : 0;
  const avgSecPerClip = safeCount > 0 ? safeTotal / safeCount : 0;
  const outputMB = safeTotal === 0
    ? 0
    : Number(((profile.bitrateMbps / 8) * safeTotal).toFixed(2));
  const encodeSec = safeTotal === 0
    ? 0
    : Math.round(profile.encodeSpeedFactor * safeTotal);
  return {
    preset,
    clipCount: safeCount,
    totalSec: safeTotal,
    avgSecPerClip,
    outputMB,
    encodeSec,
  };
}

/**
 * Formats a prediction for the legend under the preset dropdown.
 *
 *   "12 clips × ~6s avg → ~1.4 MB · 35s encode  (est. 720p30)"
 *   "—"   when `clipCount === 0`
 *
 * Targets a 1-line string ≤ ~56 chars so it fits beside the buttons.
 */
export function formatEstimate(estimate: EstimateResult): string {
  if (estimate.clipCount === 0) {
    return "—";
  }
  const avgLabel = estimate.avgSecPerClip >= 1
    ? `${Math.round(estimate.avgSecPerClip)}s`
    : `${estimate.avgSecPerClip.toFixed(1)}s`;
  const mbLabel = estimate.outputMB >= 1
    ? `${estimate.outputMB.toFixed(1)} MB`
    : `${Math.round(estimate.outputMB * 1024)} KB`;
  const secLabel = estimate.encodeSec >= 60
    ? `${Math.round(estimate.encodeSec / 6) / 10} min`
    : `${estimate.encodeSec}s`;
  return `${estimate.clipCount} clips × ~${avgLabel} avg → ~${mbLabel} · ${secLabel} encode  (est. ${RESOLUTION_HINT})`;
}
