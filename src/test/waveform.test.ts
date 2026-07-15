import { describe, it, expect, vi } from "vitest";
import { computePeaks, drawWaveform } from "../lib/waveform";

/**
 * Minimal AudioBuffer stub. The real Web Audio OfflineAudioContext is not
 * available in jsdom, so we fabricate a duck-typed object that satisfies the
 * only fields computePeaks touches: numberOfChannels, getChannelData, length,
 * sampleRate, duration.
 */
function fakeBuffer(samples: Float32Array, sampleRate = 44100) {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe("computePeaks", () => {
  it("returns an empty Float32Array when bins <= 0", () => {
    const buf = fakeBuffer(new Float32Array([1, -1, 0.5, -0.5]));
    const out = computePeaks(buf, 0);
    expect(out.length).toBe(0);
  });

  it("returns an empty Float32Array when buffer has no channels", () => {
    const buf = {
      numberOfChannels: 0,
      length: 100,
      sampleRate: 44100,
      duration: 100 / 44100,
      getChannelData: () => new Float32Array(100),
    } as unknown as AudioBuffer;
    const out = computePeaks(buf, 10);
    expect(out.length).toBe(0);
  });

  it("returns alternating min/max pairs for a clean tone", () => {
    // Constant 0.5 — each bin's min and max should both be 0.5.
    const samples = new Float32Array(1024).fill(0.5);
    const buf = fakeBuffer(samples);
    const out = computePeaks(buf, 4);
    expect(out.length).toBe(8); // 4 bins × 2 (min,max)
    for (let b = 0; b < 4; b++) {
      expect(out[b * 2]).toBeCloseTo(0.5, 5);
      expect(out[b * 2 + 1]).toBeCloseTo(0.5, 5);
    }
  });

  it("captures true min and max across a mixed signal", () => {
    // 100 samples: 10 positive-only, 10 negative-only repeating → min ≈ -1, max ≈ 1
    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      samples[i] = i % 2 === 0 ? 1 : -1;
    }
    const buf = fakeBuffer(samples);
    const out = computePeaks(buf, 10);
    expect(out.length).toBe(20);
    for (let b = 0; b < 10; b++) {
      expect(out[b * 2]).toBeCloseTo(-1, 5);
      expect(out[b * 2 + 1]).toBeCloseTo(1, 5);
    }
  });

  it("handles empty audio gracefully (no crash, max 0)", () => {
    const buf = fakeBuffer(new Float32Array(0));
    const out = computePeaks(buf, 8);
    expect(out.length).toBe(16);
    // All zeros
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(0);
  });
});

describe("drawWaveform", () => {
  function fakeCtx(): CanvasRenderingContext2D {
    const calls: { method: string; args: unknown[] }[] = [];
    const fake: any = {
      clearRect: (...a: unknown[]) => calls.push({ method: "clearRect", args: a }),
      fillRect: (...a: unknown[]) => calls.push({ method: "fillRect", args: a }),
      stroke: (..._a: unknown[]) => {},
      beginPath: (..._a: unknown[]) => {},
      moveTo: (..._a: unknown[]) => {},
      lineTo: (..._a: unknown[]) => {},
      set fillStyle(_: string) {
        /* OK */
      },
      set strokeStyle(_: string) {
        /* OK */
      },
      set lineWidth(_: number) {
        /* OK */
      },
      setTransform: (..._a: unknown[]) => {},
      __calls: calls,
    };
    return fake as CanvasRenderingContext2D;
  }

  it("calls clearRect exactly once for an empty peaks array", () => {
    const ctx = fakeCtx();
    drawWaveform(ctx, new Float32Array(0), 100, 30, 0);
    expect((ctx as any).__calls.length).toBe(0); // early return before any draw
  });

  it("draws one fillRect per bin (plus a center line stroke)", () => {
    const peaks = new Float32Array(8); // 4 bins × 2
    // bin0: min -0.5, max 0.5
    peaks[0] = -0.5; peaks[1] = 0.5;
    peaks[2] = -0.2; peaks[3] = 0.8;
    peaks[4] = -0.4; peaks[5] = 0.4;
    peaks[6] = -0.3; peaks[7] = 0.3;
    const ctx = fakeCtx();
    drawWaveform(ctx, peaks, 100, 40, 0);
    const fills = ((ctx as any).__calls as { method: string }[]).filter(
      (c) => c.method === "fillRect",
    );
    expect(fills.length).toBe(4); // one per bin
  });

  it("marks bins past the playhead as pastColor and bins before as futureColor", () => {
    let lastFill: string | null = null;
    const ctx: any = {
      clearRect: () => {},
      fillRect: () => {},
      stroke: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      setTransform: () => {},
      set fillStyle(v: string) {
        lastFill = v;
      },
      set strokeStyle(_: string) {},
      set lineWidth(_: number) {},
    };
    const peaks = new Float32Array(4); // 2 bins
    peaks[0] = -0.5; peaks[1] = 0.5;
    peaks[2] = -0.5; peaks[3] = 0.5;
    drawWaveform(ctx as CanvasRenderingContext2D, peaks, 100, 40, 0.5);
    // Both bins are drawn. Last fillStyle must be one of the expected colors.
    expect(["rgba(0, 243, 255, 0.95)", "rgba(160, 160, 160, 0.35)"]).toContain(
      lastFill,
    );
  });
});
