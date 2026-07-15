import { describe, it, expect } from "vitest";
import {
  detectSilence,
  rmsOfRange,
  toDbfs,
  DEFAULTS,
} from "../lib/silenceDetect";

// Minimal AudioBuffer shim for jsdom — we only need the methods detectSilence
// uses (getChannelData, sampleRate, numberOfChannels).
function makeFakeBuffer(
  samples: Float32Array,
  sampleRate = 44100,
): AudioBuffer {
  return {
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe("rmsOfRange / toDbfs", () => {
  it("computes RMS over a range", () => {
    const arr = new Float32Array([1, -1, 1, -1]);
    const rms = rmsOfRange(arr, 0, 4);
    expect(rms).toBeCloseTo(1, 5);
  });
  it("returns 0 for an empty range", () => {
    const arr = new Float32Array([1, 2, 3]);
    expect(rmsOfRange(arr, 0, 0)).toBe(0);
  });
  it("toDbfs returns -Infinity for 0", () => {
    expect(toDbfs(0)).toBe(-Infinity);
  });
  it("toDbfs returns 0 dBFS for amplitude 1", () => {
    expect(toDbfs(1)).toBeCloseTo(0, 5);
  });
});

describe("detectSilence", () => {
  it("returns [] for an empty buffer", () => {
    const buf = makeFakeBuffer(new Float32Array(0));
    expect(detectSilence(buf)).toEqual([]);
  });

  it("returns [] when channel is full-amplitude tone (no silence)", () => {
    const samples = new Float32Array(DEFAULTS.maxSeconds * 44100).fill(0.5);
    const buf = makeFakeBuffer(samples);
    expect(detectSilence(buf).length).toBe(0);
  });

  it("flags a clear silence gap in the middle of audio", () => {
    // 1s tone, 4s silence, 1s tone → at 50ms windows, threshold -40 dBFS,
    // expect a single ~4s "long-dead" cut.
    const sr = 44100;
    const tone = new Float32Array(sr).fill(0.5);
    const silence = new Float32Array(4 * sr); // zero amplitude
    const samples = new Float32Array(sr + 4 * sr + sr);
    samples.set(tone, 0);
    samples.set(silence, sr);
    samples.set(tone, sr + 4 * sr);
    const buf = makeFakeBuffer(samples, sr);
    const cuts = detectSilence(buf);
    expect(cuts.length).toBe(1);
    expect(cuts[0].kind).toBe("long-dead");
    // Allow small slop because of window quantization
    expect(cuts[0].endSec - cuts[0].startSec).toBeGreaterThanOrEqual(3.8);
    expect(cuts[0].endSec - cuts[0].startSec).toBeLessThanOrEqual(4.2);
  });

  it("classifies sub-3s silence as 'micro'", () => {
    const sr = 44100;
    const tone = new Float32Array(sr).fill(0.5);
    const silence = new Float32Array(2 * sr); // 2s silence
    const samples = new Float32Array(sr + 2 * sr + sr);
    samples.set(tone, 0);
    samples.set(silence, sr);
    samples.set(tone, sr + 2 * sr);
    const buf = makeFakeBuffer(samples, sr);
    const cuts = detectSilence(buf);
    expect(cuts.length).toBe(1);
    expect(cuts[0].kind).toBe("micro");
  });

  it("ignores sub-200ms blips", () => {
    const sr = 44100;
    const tone = new Float32Array(sr).fill(0.5);
    const blip = new Float32Array(Math.floor(sr * 0.1)); // 100ms silence
    const samples = new Float32Array(sr + blip.length + sr);
    samples.set(tone, 0);
    samples.set(blip, sr);
    samples.set(tone, sr + blip.length);
    const buf = makeFakeBuffer(samples, sr);
    expect(detectSilence(buf).length).toBe(0);
  });

  it("merges two adjacent silence windows into one cut", () => {
    const sr = 44100;
    const tone = new Float32Array(sr).fill(0.5);
    const silenceA = new Float32Array(sr); // 1s
    const silenceB = new Float32Array(sr); // 1s (adjacent)
    const samples = new Float32Array(sr + 2 * sr + sr);
    samples.set(tone, 0);
    samples.set(silenceA, sr);
    samples.set(silenceB, sr + sr);
    samples.set(tone, sr + 2 * sr);
    const buf = makeFakeBuffer(samples, sr);
    const cuts = detectSilence(buf);
    expect(cuts.length).toBe(1);
    expect(cuts[0].endSec - cuts[0].startSec).toBeGreaterThanOrEqual(1.8);
  });

  it("honors skipStartSec to skip the first N seconds", () => {
    const sr = 44100;
    const silence = new Float32Array(2 * sr);
    const samples = new Float32Array(2 * sr + sr);
    samples.set(silence, 0);
    samples.set(new Float32Array(sr).fill(0.5), 2 * sr);
    const buf = makeFakeBuffer(samples, sr);
    const cuts = detectSilence(buf, { skipStartSec: 3 });
    expect(cuts.length).toBe(0);
  });
});
