/**
 * Build the ffmpeg argv that concatenates the chosen clips into a single
 * MP4 reel using the concat filter.
 *
 * Why not `concat demuxer -c copy`?
 *   Scene-detection clips from arbitrary user recordings almost never
 *   align with the source codec's I-frame boundaries. The demuxer path
 *   smears/freeze-frames at the joins and desyncs audio. The filter
 *   path with a forced re-encode (libx264 + aac @ 44.1 kHz) is bullet-
 *   proof and finishes a 60 s reel of a <2 h source in ~10–15 s on a
 *   modern laptop browser.
 *
 * Each clip is trimmed IN the same filter graph — no intermediate files
 * are written to the wasm fs, so reads stay streaming and the VRAM hook
 * never gets touched.
 */
import type { ClipArtifact } from "../pipelineClient";

export type ConcatArgs = {
  /** argv to pass to ffmpeg.exec([...]) */
  args: string[];
  /** Full filter_complex string for logging / debugging */
  filterGraph: string;
};

/**
 * Return the argv + filter graph to render `clips` from a single source
 * `source.mp4` (already written to wasm fs by the renderer) to `reel.mp4`.
 *
 * Clips are rendered in the order they appear; the caller is responsible
 * for sorting by score, time, or any other policy before invoking this.
 */
export function buildConcatArgs(
  clips: ClipArtifact[],
  sourceName = "input.mp4",
  outputName = "reel.mp4",
): ConcatArgs {
  if (clips.length === 0) {
    throw new Error("buildConcatArgs: at least one clip is required");
  }
  if (clips.length > 999) {
    throw new Error("buildConcatArgs: too many clips (max 999)");
  }

  // One per-clip trim/setpts/atrim/asetpts pair, then concat them.
  const perClip = clips.map((c, i) => {
    const start = Math.max(0, Math.floor(c.startSec));
    const end = Math.max(start + 1, Math.floor(c.endSec));
    return [
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`,
    ].join(";");
  });

  const concatIn = clips.map((_, i) => `[v${i}][a${i}]`).join("");
  const filterGraph = [
    ...perClip,
    `${concatIn}concat=n=${clips.length}:v=1:a=1[vout][aout]`,
  ].join(";");

  const args: string[] = [
    "-i",
    sourceName,
    "-filter_complex",
    filterGraph,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-ar",
    "44100", // force uniform audio rate so WebM/Opus doesn't crash concat
    "-movflags",
    "+faststart", // put moov at the head for streaming playback in <video>
    outputName,
  ];

  return { args, filterGraph };
}
