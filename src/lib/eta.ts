/**
 * ETA calculator for the Neon AI Lab editing pipeline.
 *
 * The browser-side pipeline has two very different cost profiles:
 *
 *   - "demo" / "sample" / "url" (when no real file is analyzed):
 *     server-side mock with fixed ~7 s wall-clock time regardless of length.
 *
 *   - "upload" / "url" real analysis:
 *     audio decode + video frame sampling are roughly linear in source
 *     duration. Empirically the Web Audio decode dominates (~0.3–0.5×
 *     real-time on a laptop), frame sampling is ~0.2× real-time, and
 *     artifact build/ingest is comparatively tiny.
 *
 * This module returns a human-readable remaining-time string and the
 * raw seconds so callers can decide how to render it.
 */

export type SourceKind = "upload" | "url" | "demo" | "sample" | "youtube";

export interface EtaResult {
  /** Seconds remaining (best estimate). */
  seconds: number;
  /** Human-readable string like "~2m 15s remaining". */
  text: string;
  /** True if the estimate is based on real analysis (not the mock). */
  isReal: boolean;
}

const DEMO_SECONDS = 8;

// Empirical constants for the parallel browser pipeline:
// - fixed overhead (decode setup, artifact build, ingest)
// - per-sample video seek cost (dynamic interval in videoAnalysis.ts)
// - audio decode runs in parallel and is usually not the bottleneck.
const REAL_OVERHEAD_SECONDS = 6;
const VIDEO_SEEK_COST = 0.18; // seconds per frame sample

function sampleIntervalFor(durationSec: number): number {
  if (durationSec <= 30) return 3.0;
  if (durationSec <= 120) return 2.0;
  if (durationSec <= 600) return 1.5;
  return 1.0;
}

/**
 * Estimate remaining edit time.
 *
 * @param source      What kind of source is being edited.
 * @param durationSec Total source duration in seconds.
 * @param progress    0..100 progress of the current run.
 */
export function estimateEditTime(
  source: SourceKind,
  durationSec: number,
  progress: number,
): EtaResult {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const remainingRatio = 1 - clampedProgress / 100;

  let totalSeconds: number;
  let isReal: boolean;

  if (source === "demo" || source === "sample") {
    totalSeconds = DEMO_SECONDS;
    isReal = false;
  } else if (source === "youtube") {
    // YouTube goes through the same real analysis path as a URL, but we
    // add a backend metadata resolve + download step.
    totalSeconds =
      REAL_OVERHEAD_SECONDS +
      Math.max(10, (durationSec / sampleIntervalFor(durationSec)) * VIDEO_SEEK_COST) +
      8;
    isReal = true;
  } else {
    // upload / url real analysis: audio + video run in parallel;
    // video frame sampling is usually the bottleneck.
    totalSeconds =
      REAL_OVERHEAD_SECONDS +
      Math.max(10, (durationSec / sampleIntervalFor(durationSec)) * VIDEO_SEEK_COST);
    isReal = true;
  }

  const seconds = Math.max(1, Math.round(totalSeconds * remainingRatio));
  return {
    seconds,
    text: formatEta(seconds),
    isReal,
  };
}

function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `~${seconds}s remaining`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) {
    return s === 0 ? `~${m}m remaining` : `~${m}m ${s}s remaining`;
  }
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `~${h}h remaining` : `~${h}h ${rm}m remaining`;
}
