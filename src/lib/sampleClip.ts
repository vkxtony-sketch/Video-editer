// sampleClip.ts — Generate a real 30-second video clip in the browser
// without shipping any media asset. The resulting WebM has:
//
//   * A canvas that color-cycles every ~3 seconds, so the existing
//     dHash scene-change detector (interval=1s, threshold=18) finds
//     MULTIPLE real scene changes.
//   * A Web Audio oscillator pattern with deliberate LOUD/SILENT phases,
//     so `detectSilences` finds ≥2 dead-air cuts (>3s of low-energy
//     audio) and `findEnergyPeaks` finds ≥3 loud windows.
//
// This means clicking "Try with sample" runs the FULL real pipeline
// (`analyzeAndIngest` → Web Audio decode → dHash scene detection →
// thumbnail capture → Convex ingest) end-to-end with zero assets and
// zero network requirement — every metric on the Studio page is real.

export const SAMPLE_DEFAULT_DURATION_SEC = 30;
export const SAMPLE_MIN_DURATION_SEC = 15;
export const SAMPLE_MAX_DURATION_SEC = 120;

export type SampleProgress =
  | { phase: "prepare" }
  | { phase: "render"; elapsedSec: number; totalSec: number }
  | { phase: "finalize" };

export type SampleClipOptions = {
  /** Total duration in seconds. Clamped to [SAMPLE_MIN, SAMPLE_MAX]. */
  durationSec?: number;
  /** Optional fixed seed for the deterministic pattern (mostly for tests). */
  seed?: number;
  /** Per-tick progress callback. */
  onProgress?: (p: SampleProgress) => void;
};

export type SamplePattern = Array<{
  /** 0-indexed chunk in the timeline. */
  idx: number;
  startSec: number;
  endSec: number;
  kind: "loud" | "silent" | "quiet" | "mid";
  /** Web Audio oscillator params (when kind !== silent). */
  oscType: OscillatorType;
  freq: number;
  amp: number;
}>;

export type SceneSchedule = Array<{
  startSec: number;
  hue: number;
}>;

export type PreparedSample = {
  /** Total duration clamped. */
  durationSec: number;
  pattern: SamplePattern;
  scenes: SceneSchedule;
  /** Ordered labels for human review. */
  summary: string[];
};

/**
 * Pure helper: build the deterministic audio + scene-change schedule.
 * Exported so tests can reason about what the generator will produce
 * without needing MediaRecorder/AudioContext in jsdom.
 */
export function prepareSample(opts: SampleClipOptions = {}): PreparedSample {
  const raw = opts.durationSec ?? SAMPLE_DEFAULT_DURATION_SEC;
  const durationSec = Math.max(
    SAMPLE_MIN_DURATION_SEC,
    Math.min(SAMPLE_MAX_DURATION_SEC, Math.floor(raw)),
  );

  // Deterministic pattern: 8 chunks of ~equal length (last may be shorter).
  // Mix of loud / silent / quiet / mid so all the existing detectors find
  // something interesting.
  const chunkLen = durationSec / 8;
  const kinds: SamplePattern[number]["kind"][] = [
    "loud",
    "loud",
    "silent",
    "quiet",
    "loud",
    "silent",
    "mid",
    "loud",
  ];
  const oscSeeds: Array<{ type: OscillatorType; freq: number; amp: number }> = [
    { type: "square", freq: 440, amp: 0.6 },
    { type: "square", freq: 660, amp: 0.5 },
    { type: "square", freq: 0, amp: 0 },
    { type: "sine", freq: 220, amp: 0.2 },
    { type: "square", freq: 880, amp: 0.7 },
    { type: "square", freq: 0, amp: 0 },
    { type: "triangle", freq: 440, amp: 0.4 },
    { type: "square", freq: 660, amp: 0.7 },
  ];

  const pattern: SamplePattern = kinds.map((kind, i) => {
    const startSec = Math.round(i * chunkLen);
    const endSec = Math.round((i + 1) * chunkLen);
    const seed = oscSeeds[i] ?? { type: "sine", freq: 220, amp: 0.2 };
    return {
      idx: i,
      startSec,
      endSec,
      kind,
      oscType: seed.type,
      freq: seed.freq,
      amp: seed.amp,
    };
  });

  // Color scenes every 3 seconds — produces >= ceil(duration/3) scene
  // changes the frame-hash detector will pick up.
  const scenes: SceneSchedule = [];
  for (let t = 0; t < durationSec; t += 3) {
    scenes.push({ startSec: t, hue: ((t / 3) * 60) % 360 });
  }

  return {
    durationSec,
    pattern,
    scenes,
    summary: pattern.map((p) =>
      `${p.startSec}-${p.endSec}s · ${p.kind}${p.amp > 0 ? ` (${p.freq}Hz · ${Math.round(p.amp * 100)}%)` : ""}`,
    ),
  };
}

/**
 * Render the prepared pattern into a real WebM `File` using canvas +
 * Web Audio + MediaRecorder. Throws if any prerequisite API is missing
 * (callers should fall back to a friendly error).
 *
 * Typical pitfalls this function already handles:
 *   - MediaRecorder absent (jsdom, some embedded webviews) → throws.
 *   - AudioContext absent → throws.
 *   - canvas.getContext("2d") null → throws.
 *   - Canvas captureStream not supported (very old FF) → throws.
 *   - No supported MIME type → throws.
 *
 * The canvas + audio recording is auto-stopped at `durationSec + 0.5s`
 * so we always emit a properly-fragmented WebM (otherwise MediaRecorder
 * hangs waiting for `stop()`).
 */
export async function generateSampleClip(
  opts: SampleClipOptions = {},
): Promise<File> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error(
      "MediaRecorder is not available in this browser — the sample clip can't be generated. Use Upload or URL source instead.",
    );
  }

  // Check MIME support BEFORE spinning up canvas + AudioContext — that way
  // mocked tests that return false from isTypeSupported hit the friendly
  // "no supported MIME type" error instead of leaking a canvas error first.
  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) {
    throw new Error("No supported MediaRecorder MIME type in this browser");
  }

  const prep = prepareSample(opts);
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser");
  if (typeof (canvas as HTMLCanvasElement).captureStream !== "function") {
    throw new Error("Canvas.captureStream is not supported in this browser");
  }
  const fps = 30;
  const videoStream = (canvas as HTMLCanvasElement).captureStream(fps);

  const AudioCtor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) throw new Error("AudioContext unavailable in this browser");
  const audioCtx = new AudioCtor() as AudioContext;
  const dest = audioCtx.createMediaStreamDestination();

  // Wire up each non-silent chunk. We use a single master gain that
  // gently ramps each segment in/out so the analyzer hears real
  // envelopes (not a sudden on/off that would read as a click).
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(dest);

  for (const seg of prep.pattern) {
    if (seg.amp === 0) continue;
    const osc = audioCtx.createOscillator();
    osc.type = seg.oscType;
    osc.frequency.value = seg.freq;
    const g = audioCtx.createGain();
    g.gain.value = 0;
    g.connect(masterGain);
    osc.connect(g);
    const startAt = audioCtx.currentTime + seg.startSec;
    const endAt = audioCtx.currentTime + seg.endSec;
    g.gain.setValueAtTime(0, startAt);
    g.gain.linearRampToValueAtTime(seg.amp, startAt + 0.05);
    g.gain.setValueAtTime(seg.amp, Math.max(startAt + 0.06, endAt - 0.05));
    g.gain.linearRampToValueAtTime(0, endAt);
    osc.start(startAt);
    osc.stop(endAt + 0.05);
  }

  const audioTrack = dest.stream.getAudioTracks()[0];
  if (audioTrack) videoStream.addTrack(audioTrack);

  const recorder = new MediaRecorder(videoStream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Color-cycle animation loop. We don't track by wall-clock; we use
  // performance.now() so the canvas stays in sync with the consumed
  // audio (which MediaRecorder will buffer internally). This means the
  // emitted WebM has matching A/V durations even if RAF is throttled.
  const startMs = performance.now();
  let raf = 0;
  const draw = () => {
    const elapsed = (performance.now() - startMs) / 1000;
    const sceneIdx = Math.min(
      prep.scenes.length - 1,
      Math.max(0, Math.floor(elapsed / 3)),
    );
    const scene = prep.scenes[sceneIdx] ?? { hue: 0, startSec: 0 };
    ctx.fillStyle = `hsl(${scene.hue}, 80%, 28%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Inner card with the current scene label so each scene is visually distinct.
    ctx.fillStyle = `hsl(${(scene.hue + 180) % 360}, 90%, 70%)`;
    ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80);
    ctx.fillStyle = "#0a0a14";
    ctx.font = "bold 42px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Neon AI Lab · Sample ${Math.floor(elapsed)}s`,
      canvas.width / 2,
      canvas.height / 2 - 12,
    );
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(
      `Scene ${sceneIdx + 1}/${prep.scenes.length} · ${prep.summary[sceneIdx] ?? ""}`,
      canvas.width / 2,
      canvas.height / 2 + 28,
    );
    opts.onProgress?.({
      phase: "render",
      elapsedSec: elapsed,
      totalSec: prep.durationSec,
    });
    if (elapsed < prep.durationSec) {
      raf = requestAnimationFrame(draw);
    }
  };
  raf = requestAnimationFrame(draw);

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(100);
  // Hold the recording a bit longer than durationSec so MediaRecorder has
  // time to flush the trailing segment. We await both the timeout and the
  // recorder.onstop before resolving.
  await new Promise<void>((resolve) =>
    setTimeout(resolve, (prep.durationSec + 0.6) * 1000),
  );
  try {
    recorder.stop();
  } catch {
    /* some browsers throw if already stopped; ignore */
  }
  cancelAnimationFrame(raf);

  await Promise.race([
    stopped,
    new Promise<void>((_, rj) =>
      setTimeout(() => rj(new Error("MediaRecorder.stop() timed out")), 4000),
    ),
  ]);

  opts.onProgress?.({ phase: "finalize" });

  // Tear down audio nodes we own so the AudioContext can GC.
  try {
    await audioCtx.close();
  } catch {
    /* fine */
  }

  const blob = new Blob(chunks, { type: mime });
  return new File([blob], `sample-tutorial-${prep.durationSec}s.webm`, {
    type: mime,
  });
}
