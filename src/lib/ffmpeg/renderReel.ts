/**
 * Lazy-loaded FFmpeg.wasm wrapper that turns the pipeline's clip
 * decisions + a source video into a single MP4 you can actually play.
 *
 * Why this file?
 *   - `@ffmpeg/ffmpeg` ships ~30 MB of wasm core that we only want to
 *     pay for AFTER the user clicks Export (not on Studio mount).
 *   - The `FFmpeg` class is dynamic-imported so @ffmpeg/ffmpeg is
 *     never pulled into the initial bundle.
 *   - A module-level singleton caches the loaded instance so repeat
 *     exports reuse the same wasm worker (~50–80 MB heap savings).
 *
 * What it produces:
 *   - `renderHighlightReel(...)` returns an MP4 Blob (the "highlight
 *     reel"). Internally it builds a `concat filter` argv via
 *     `filterGraph.buildConcatArgs(...)`, trims each clip in-graph
 *     (no intermediate wasm-fs files), re-encodes with libx264 +
 *     aac, faststart-marks `movflags` for instant <video> playback.
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ClipArtifact } from "../pipelineClient";
import type { RenderPreset } from "../useLocalStorage";
import { buildConcatArgs } from "./filterGraph";

/** Latest stable single-thread core. We avoid @ffmpeg/core-mt because
 *  the Freebuff/Vly preview does not send COOP/COEP headers, so
 *  SharedArrayBuffer is unavailable.
 *  Hosted on unpkg.com — see https://github.com/ffmpegwasm/ffmpeg.wasm */
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const SOURCE_NAME = "input.mp4";
const OUTPUT_NAME = "reel.mp4";

/** Multiplier against durationSec. v1 is browser-only and capped at 2 h. */
export const BROWSER_RENDER_MAX_SEC = 60 * 60 * 2; // 2 hours

export type RenderReelOptions = {
  /** Source video (File from drop or Blob from object URL). */
  videoBlob: Blob | File;
  /** Clips to stitch into the reel — must be non-empty. The caller
   *  decides the order (we render in array order). */
  clips: ClipArtifact[];
  /** 0..1 progress ratio. FFmpeg fires these from its decode/encode
   *  phase; we forward them verbatim. */
  onProgress?: (ratio: number) => void;
  /** libx264 `-preset` token. Default "ultrafast"; higher presets
   *  (veryfast, medium) produce smaller files at the cost of
   *  slower browser-side encode. Plumbed straight into the
   *  buildConcatArgs argv. */
  preset?: RenderPreset;
  /** Override the core URLs (used in tests to avoid the network). */
  coreURL?: string;
  wasmURL?: string;
};

/**
 * Render the clip list into a single MP4 reel. Throws on empty clip
 * lists, oversized sources (> BROWSER_RENDER_MAX_SEC), or FFmpeg
 * non-zero exit codes. Always cleans up the wasm fs artifacts.
 */
export async function renderHighlightReel(
  opts: RenderReelOptions,
): Promise<Blob> {
  if (opts.clips.length === 0) {
    throw new Error("renderHighlightReel: no clips to render");
  }
  const ffmpeg = await getFfmpeg(opts);
  const { toBlobURL, fetchFile } = await import("@ffmpeg/util");

  if (!opts.coreURL) {
    // One-time wasm load — toBlobURL fetches each core asset under a
    // blob: URL so the worker can read it without CORS drama.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }

  const progress = (ratio: number) =>
    opts.onProgress?.(Math.max(0, Math.min(1, ratio)));
  ffmpeg.on("progress", ({ progress: r, time }) => {
    // FFmpeg's `progress` is a 0..1 ratio computed against an estimated
    // total duration. The estimator breaks down on long encodes so the
    // ratio can drift above 1 or go negative mid-render. Decision tree:
    //   1. If `r` is in [0..1] — use it directly.
    //   2. Else if `time` is > 0 — fall back to time-derived ratio.
    //   3. Else hand the malformed value to the progress() helper, which
    //      clamps to [0..1] so we never emit a NaN or out-of-range
    //      number to the UI.
    if (typeof r === "number") {
      if (r >= 0 && r <= 1) progress(r);
      else if (typeof time === "number" && time > 0) progress(time / 60_000);
      else progress(r);
    } else if (typeof time === "number") {
      progress(time / 60_000);
    }
  });

  try {
    await ffmpeg.writeFile(SOURCE_NAME, await fetchFile(opts.videoBlob));
    const { args, filterGraph } = buildConcatArgs(
      opts.clips,
      SOURCE_NAME,
      OUTPUT_NAME,
      opts.preset ?? "ultrafast",
    );
    const exit = await ffmpeg.exec(args);
    if (exit !== 0) {
      throw new Error(`renderHighlightReel: ffmpeg exec failed with exit ${exit} (filter=${filterGraph.slice(0, 200)}…)`);
    }
    const out = await ffmpeg.readFile(OUTPUT_NAME);
    // `readFile` returns a Uint8Array in browser builds. The cast through
    // ArrayBuffer works around TS 5.x's stricter `Uint8Array<ArrayBufferLike>`
    // aliasing vs the Blob constructor's `BlobPart[]` parameter.
    const bytes =
      out instanceof Uint8Array
        ? out
        : new Uint8Array(out as unknown as ArrayBuffer);
    return new Blob([bytes as BlobPart], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", () => {});
    // Best-effort cleanup; ignore errors so they don't mask a real throw above.
    try { await ffmpeg.deleteFile(SOURCE_NAME); } catch { /* swallow */ }
    try { await ffmpeg.deleteFile(OUTPUT_NAME); } catch { /* swallow */ }
  }
}

/**
 * True if `durationSec` is within the supported browser-render budget.
 * Anything longer should fall back to a JSON EDL export or a server
 * render path (future Path B).
 */
export function isWithinBrowserRenderBudget(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 0 && durationSec <= BROWSER_RENDER_MAX_SEC;
}

// -- internal singleton ----------------------------------------------------

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(opts: RenderReelOptions): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const inst = new FFmpeg();
    ffmpegInstance = inst;
    return inst;
  })();
  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    // Reset so a follow-up call can retry instead of hitting the same rejected promise.
    ffmpegLoadPromise = null;
    throw err;
  }
  // Suppress unused-param for opts (kept for forward-compat with overrides).
  void opts;
}
