// Real visual analysis: sample frames from a video file via a hidden
// HTMLVideoElement + Canvas 2D, compute dHash (perceptual difference hash),
// and detect scene-change moments via Hamming distance.

export type FrameHash = {
  tSec: number;
  hash: number; // 64-bit dHash as a number
  brightness: number; // 0..1 average luminance
};

export type SceneChange = {
  tSec: number;
  // Distance between this frame and the previous one (0..64)
  distance: number;
};

export type VideoAnalysis = {
  durationSec: number;
  width: number;
  height: number;
  frames: FrameHash[];
  sceneChanges: SceneChange[];
};

const BASE_SAMPLE_INTERVAL = 1.0; // seconds between sampled frames for long videos
const SCENE_THRESHOLD = 18; // Hamming distance > this counts as a scene change

/** Pick a sample interval that keeps short videos fast without losing
 *  scene-detection accuracy on long VODs. */
function sampleIntervalFor(durationSec: number): number {
  if (durationSec <= 30) return 3.0;
  if (durationSec <= 120) return 2.0;
  if (durationSec <= 600) return 1.5;
  return BASE_SAMPLE_INTERVAL;
}

export async function analyzeVideo(
  url: string,
  totalDurationSec: number,
  onProgress?: (frac: number) => void,
): Promise<VideoAnalysis> {
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      reject(new Error("video metadata failed to load"));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onErr);
  });

  const width = 64;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const duration = isFinite(video.duration)
    ? Math.min(video.duration, totalDurationSec)
    : totalDurationSec;
  const interval = sampleIntervalFor(duration);
  const samples: number[] = []; // tSec values
  for (let t = 0; t <= duration - 0.001; t += interval) {
    samples.push(Math.min(t, duration - 0.05));
  }
  if (samples.length === 0) samples.push(0);

  const frames: FrameHash[] = [];
  const sceneChanges: SceneChange[] = [];

  for (let i = 0; i < samples.length; i++) {
    const t = samples[i];
    await seekVideo(video, t);
    const { hash, brightness } = drawAndHash(video, ctx, width, height);
    frames.push({ tSec: t, hash, brightness });
    if (i > 0) {
      const prev = frames[i - 1].hash;
      const dist = hamming64(prev ^ hash);
      if (dist > SCENE_THRESHOLD) {
        sceneChanges.push({ tSec: t, distance: dist });
      }
    }
    onProgress?.(0.1 + 0.85 * (i / samples.length));
  }

  // Cleanup
  video.removeAttribute("src");
  video.load();

  return {
    durationSec: duration,
    width: video.videoWidth || width,
    height: video.videoHeight || height,
    frames,
    sceneChanges,
  };
}

function seekVideo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
    try {
      video.currentTime = t;
    } catch {
      // some browsers throw if seeking to the same value twice in a row
      resolve();
    }
    // Safety timeout
    setTimeout(() => {
      video.removeEventListener("seeked", handler);
      resolve();
    }, 1500);
  });
}

function drawAndHash(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): { hash: number; brightness: number } {
  ctx.drawImage(video, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8ClampedArray(w * h);
  let sum = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const v = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[j] = v;
    sum += v;
  }
  const brightness = sum / (w * h * 255);
  // dHash: compare each pixel to its right neighbor → 8 rows × (w-1) = 504 bits.
  // We'll just keep the first 64 bits (rows 0..7, columns 0..7).
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray[y * w + x];
      const right = gray[y * w + x + 1];
      if (left > right) hash |= 1n << BigInt(y * 8 + x);
    }
  }
  return { hash: Number(hash & 0xffffffffffffffffn), brightness };
}

function hamming64(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export type CapturedThumbnail = {
  tSec: number;
  dataUrl: string;
  width: number;
  height: number;
};

/**
 * Pure helper — encode a Canvas as a JPEG data URL. Extracted so it can be
 * unit-tested in isolation without needing a real HTMLVideoElement.
 */
export function jpegFromCanvas(canvas: HTMLCanvasElement, quality = 0.7): string {
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Capture up to `count` real frame thumbnails from a video URL, one at each
 * peak moment. Each capture is a 480×270 JPEG data URL — small enough
 * (~10–20 KB) to store inline in Convex documents.
 *
 * Returns an array (possibly shorter than `count` if the browser can't
 * decode a particular seek target). On failure, returns [] so the caller
 * can fall back to palette-only thumbnails gracefully.
 */
export async function extractThumbnails(
  url: string,
  peaks: { startSec: number; endSec: number; score: number }[],
  count = 5,
  onProgress?: (frac: number) => void,
): Promise<CapturedThumbnail[]> {
  if (peaks.length === 0) return [];
  const video = document.createElement("video");
  video.src = url;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onErr);
      reject(new Error("video metadata failed to load"));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onErr);
  });

  const width = 480;
  const height = 270;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    video.removeAttribute("src");
    video.load();
    return [];
  }

  const out: CapturedThumbnail[] = [];
  const top = peaks.slice(0, count);
  for (let i = 0; i < top.length; i++) {
    const center = Math.floor((top[i].startSec + top[i].endSec) / 2);
    await seekVideo(video, center);
    try {
      ctx.drawImage(video, 0, 0, width, height);
      out.push({
        tSec: center,
        dataUrl: jpegFromCanvas(canvas),
        width,
        height,
      });
    } catch {
      // some browsers throw if the frame hasn't decoded enough yet — skip
      continue;
    }
    onProgress?.((i + 1) / top.length);
  }

  video.removeAttribute("src");
  video.load();
  return out;
}
