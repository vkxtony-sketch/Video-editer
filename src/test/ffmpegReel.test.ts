import { describe, expect, test, vi, beforeEach } from "vitest";

/**
 * Tests for the browser-side FFmpeg renderer. We mock both
 * `@ffmpeg/ffmpeg` (the FFmpeg class + worker) and `@ffmpeg/util`
 * (fetchFile + toBlobURL helpers) so the tests stay hermetic —
 * no network, no wasm, no actual rendering.
 *
 * Shared mock state is declared with vi.hoisted() so the mock
 * factories (which run before module imports due to vitest's
 * hoisting behaviour) can write into it without violating TDZ rules.
 */
const mock = vi.hoisted(() => {
  const written: Array<{ path: string; bytes: number }> = [];
  const executed: string[][] = [];
  const read: { [path: string]: Uint8Array } = {};
  const deleted: string[] = [];
  const progressListeners: Array<(e: { progress: number; time: number }) => void> = [];

  const ffmpeg = {
    load: vi.fn().mockResolvedValue(true),
    on: vi.fn().mockImplementation(
      (event: string, cb: (e: { progress: number; time: number }) => void) => {
        if (event === "progress") progressListeners.push(cb);
      },
    ),
    off: vi.fn().mockImplementation(
      (event: string, cb: (e: { progress: number; time: number }) => void) => {
        if (event !== "progress") return;
        const i = progressListeners.indexOf(cb);
        if (i >= 0) progressListeners.splice(i, 1);
      },
    ),
    writeFile: vi.fn().mockImplementation(async (path: string, data: unknown) => {
      const isUint8 = data instanceof Uint8Array;
      const bytes = isUint8
        ? data.byteLength
        : typeof data === "object" && data !== null && "byteLength" in data
        ? (data as { byteLength: number }).byteLength
        : 0;
      written.push({ path, bytes });
      return true;
    }),
    exec: vi.fn().mockImplementation(async (args: string[]) => {
      executed.push(args);
      // Pre-populate the output buffer with a synthetic 64-byte MP4.
      const buf = new Uint8Array(64);
      const dv = new DataView(buf.buffer);
      dv.setUint32(0, 32);
      buf.set([0x66, 0x74, 0x79, 0x70], 4);
      buf.set([0x69, 0x73, 0x6f, 0x6d], 8);
      dv.setUint32(32, 8);
      buf.set([0x6d, 0x6f, 0x6f, 0x76], 36);
      read["reel.mp4"] = buf;
      return 0;
    }),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      const data = read[path];
      if (!data) throw new Error(`mock readFile: no fixture for ${path}`);
      return data;
    }),
    deleteFile: vi.fn().mockImplementation(async (path: string) => {
      deleted.push(path);
      return true;
    }),
  };

  return { written, executed, read, deleted, progressListeners, ffmpeg };
});

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: vi.fn(() => mock.ffmpeg),
}));

vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn(async (input: unknown) => {
    if (input instanceof Uint8Array) return input;
    // Mirror @ffmpeg/util's real `fetchFile`: for a Blob input, return
    // the full byte content (size preserved) so writeFile() records the
    // correct byte count downstream.
    if (input instanceof Blob) {
      return new Uint8Array(await input.arrayBuffer());
    }
    return new Uint8Array([0, 0, 0, 0xff]);
  }),
  toBlobURL: vi.fn(async () => "blob:fake-core-url"),
}));

// After vi.mock factories are hoisted, the SUT can import normally.
import {
  renderHighlightReel,
  isWithinBrowserRenderBudget,
  BROWSER_RENDER_MAX_SEC,
} from "@/lib/ffmpeg/renderReel";
import type { ClipArtifact } from "@/lib/pipelineClient";

// ClipArtifact is the local pipeline shape (extra fields like projectId/
// title/rationale/createdAt are required); `_id` is added by Convex at
// runtime. We only need start/end/score/kind here, so cast from a
// permissive local type.
type MinimalClip = Pick<
  ClipArtifact,
  "kind" | "startSec" | "endSec" | "score"
>;
const fakeClip: MinimalClip = {
  startSec: 10,
  endSec: 20,
  kind: "highlight",
  score: 0.95,
};

beforeEach(() => {
  mock.written.length = 0;
  mock.executed.length = 0;
  mock.deleted.length = 0;
  mock.progressListeners.length = 0;
  for (const k of Object.keys(mock.read)) delete mock.read[k];
  vi.clearAllMocks();
});

describe("renderHighlightReel", () => {
  test("writes source to wasm fs, execs the concat graph, reads the output, cleans up", async () => {
    const result = await renderHighlightReel({
      videoBlob: new Blob([new Uint8Array(1024)], { type: "video/mp4" }),
      clips: [fakeClip as unknown as ClipArtifact],
    });

    // load() called once (singleton — second call reuses).
    expect(mock.ffmpeg.load).toHaveBeenCalledTimes(1);
    const loadArg = mock.ffmpeg.load.mock.calls[0][0] as
      | { coreURL: string; wasmURL: string }
      | undefined;
    expect(loadArg).toBeDefined();
    expect(loadArg?.coreURL).toMatch(/^blob:/);
    expect(loadArg?.wasmURL).toMatch(/^blob:/);

    // Source written to wasm fs.
    expect(mock.written).toHaveLength(1);
    expect(mock.written[0].path).toBe("input.mp4");
    expect(mock.written[0].bytes).toBe(1024);

    // exec() ran with our filter graph.
    expect(mock.executed).toHaveLength(1);
    expect(mock.executed[0][0]).toBe("-i");
    expect(mock.executed[0][1]).toBe("input.mp4");
    expect(mock.executed[0]).toContain("libx264");
    expect(mock.executed[0]).toContain("aac");
    expect(mock.executed[0][mock.executed[0].length - 1]).toBe("reel.mp4");

    const idx = mock.executed[0].indexOf("-filter_complex");
    expect(idx).toBeGreaterThan(0);
    const filterGraph = mock.executed[0][idx + 1];
    expect(filterGraph).toMatch(/trim=start=10:end=20/);
    expect(filterGraph).toMatch(/atrim=start=10:end=20/);
    expect(filterGraph).toMatch(/concat=n=1:v=1:a=1/);
    expect(filterGraph).toMatch(/\[vout\]\[aout\]/);

    // Listen to progress events and read the result.
    expect(mock.ffmpeg.readFile).toHaveBeenCalledWith("reel.mp4");
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("video/mp4");
    expect(result.size).toBe(64);

    // Cleanup ran in finally.
    expect(mock.deleted).toContain("input.mp4");
    expect(mock.deleted).toContain("reel.mp4");
    expect(mock.ffmpeg.off).toHaveBeenCalledWith(
      "progress",
      expect.any(Function),
    );
  });

  test("throws when clips is empty", async () => {
    await expect(
      renderHighlightReel({
        videoBlob: new Blob([new Uint8Array(16)]),
        clips: [],
      }),
    ).rejects.toThrow(/no clips/i);
  });

  test("forwards progress events via onProgress", async () => {
    const onProgress = vi.fn();
    await renderHighlightReel({
      videoBlob: new Blob([new Uint8Array(64)]),
      clips: [fakeClip as unknown as ClipArtifact],
      onProgress,
    });

    expect(mock.progressListeners).toHaveLength(1);
    mock.progressListeners[0]({ progress: 0.42, time: 1234 });
    expect(onProgress).toHaveBeenCalledWith(0.42);
  });

  test("falls back to time-based ratio when progress > 1", async () => {
    const onProgress = vi.fn();
    await renderHighlightReel({
      videoBlob: new Blob([new Uint8Array(64)]),
      clips: [fakeClip as unknown as ClipArtifact],
      onProgress,
    });

    mock.progressListeners[0]({ progress: 2.5, time: 30000 });
    expect(onProgress).toHaveBeenCalledWith(30000 / 60_000);
  });

  test("throws on a non-zero ffmpeg exit code", async () => {
    mock.ffmpeg.exec.mockResolvedValueOnce(1);
    await expect(
      renderHighlightReel({
        videoBlob: new Blob([new Uint8Array(64)]),
        clips: [fakeClip as unknown as ClipArtifact],
      }),
    ).rejects.toThrow(/exit 1/i);
  });

  test("still runs cleanup when exec throws", async () => {
    mock.ffmpeg.exec.mockRejectedValueOnce(new Error("ffmpeg simulated oom"));
    await expect(
      renderHighlightReel({
        videoBlob: new Blob([new Uint8Array(64)]),
        clips: [fakeClip as unknown as ClipArtifact],
      }),
    ).rejects.toThrow(/simulated oom/i);
    expect(mock.deleted).toContain("input.mp4");
    expect(mock.deleted).toContain("reel.mp4");
  });

  test("clamps progress to 0..1 (defends against malformed events)", async () => {
    const onProgress = vi.fn();
    await renderHighlightReel({
      videoBlob: new Blob([new Uint8Array(64)]),
      clips: [fakeClip as unknown as ClipArtifact],
      onProgress,
    });
    mock.progressListeners[0]({ progress: -5, time: 0 });
    expect(onProgress).toHaveBeenLastCalledWith(0);
    mock.progressListeners[0]({ progress: 7, time: 0 });
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  test("defaults to ultrafast when no preset option is supplied", async () => {
    await renderHighlightReel({
      videoBlob: new Blob([new Uint8Array(64)]),
      clips: [fakeClip as unknown as ClipArtifact],
    });
    const last = mock.executed[mock.executed.length - 1];
    expect(last).toContain("-preset");
    expect(last).toContain("ultrafast");
  });

  test("threads superfast / veryfast / medium presets into the ffmpeg argv", async () => {
    for (const preset of ["superfast", "veryfast", "medium"] as const) {
      await renderHighlightReel({
        videoBlob: new Blob([new Uint8Array(64)]),
        clips: [fakeClip as unknown as ClipArtifact],
        preset,
      });
      const last = mock.executed[mock.executed.length - 1];
      expect(last).toContain("-preset");
      expect(last).toContain(preset);
    }
  });

  test("rejects unknown preset values at the buildConcatArgs boundary", async () => {
    await expect(
      renderHighlightReel({
        videoBlob: new Blob([new Uint8Array(64)]),
        clips: [fakeClip as unknown as ClipArtifact],
        // Cast through unknown to bypass TypeScript's literal-type check.
        preset: "ultra-mega-fast" as unknown as "ultrafast",
      }),
    ).rejects.toThrow(/invalid preset/i);
  });
});

describe("isWithinBrowserRenderBudget", () => {
  test("treats anything strictly between 0 and 2 hours as in-budget", () => {
    expect(isWithinBrowserRenderBudget(60)).toBe(true);
    expect(isWithinBrowserRenderBudget(3600)).toBe(true);
    expect(isWithinBrowserRenderBudget(BROWSER_RENDER_MAX_SEC)).toBe(true);
  });

  test("treats 0 and anything over 2 hours as out of budget", () => {
    expect(isWithinBrowserRenderBudget(0)).toBe(false);
    expect(isWithinBrowserRenderBudget(BROWSER_RENDER_MAX_SEC + 1)).toBe(false);
    expect(isWithinBrowserRenderBudget(86_400)).toBe(false);
  });

  test("rejects negative / non-finite values", () => {
    expect(isWithinBrowserRenderBudget(-1)).toBe(false);
    expect(isWithinBrowserRenderBudget(NaN)).toBe(false);
    expect(isWithinBrowserRenderBudget(Infinity)).toBe(false);
  });
});
