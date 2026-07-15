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

const SAMPLE_INTERVAL = 1.0; // seconds between sampled frames
const SCENE_THRESHOLD = 18; // Hamming distance > this counts as a scene change

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
  const samples: number[] = []; // tSec values
  for (let t = 0; t <= duration - 0.001; t += SAMPLE_INTERVAL) {
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
