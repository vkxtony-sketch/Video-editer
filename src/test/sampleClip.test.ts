import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateSampleClip,
  prepareSample,
  SAMPLE_DEFAULT_DURATION_SEC,
  SAMPLE_MIN_DURATION_SEC,
  SAMPLE_MAX_DURATION_SEC,
} from "../lib/sampleClip";

describe("prepareSample (pure helper)", () => {
  it("clamps duration into [MIN, MAX] range", () => {
    expect(prepareSample({ durationSec: 5 }).durationSec).toBe(SAMPLE_MIN_DURATION_SEC);
    expect(prepareSample({ durationSec: 9999 }).durationSec).toBe(SAMPLE_MAX_DURATION_SEC);
    expect(prepareSample({ durationSec: 45 }).durationSec).toBe(45);
  });

  it("uses the project's default duration when no override is provided", () => {
    expect(prepareSample().durationSec).toBe(SAMPLE_DEFAULT_DURATION_SEC);
  });

  it("emits ≥3 loud chunks + ≥2 silent chunks so peak/silence detectors find something", () => {
    const prep = prepareSample({ durationSec: 30 });
    const loud = prep.pattern.filter((p) => p.kind === "loud").length;
    const silent = prep.pattern.filter((p) => p.kind === "silent").length;
    expect(loud).toBeGreaterThanOrEqual(3);
    expect(silent).toBeGreaterThanOrEqual(2);
  });

  it("produces a scene-change schedule every 3 seconds for the dHash detector", () => {
    const prep = prepareSample({ durationSec: 30 });
    expect(prep.scenes.length).toBe(10); // 0,3,6,...,27 = 10 entries
    expect(prep.scenes[0]?.startSec).toBe(0);
    expect(prep.scenes[1]?.startSec).toBe(3);
    const lastScene = prep.scenes[prep.scenes.length - 1];
    expect(lastScene?.startSec).toBeLessThanOrEqual(prep.durationSec);
  });

  it("non-silent chunks have non-zero amp + a valid oscillator type", () => {
    const prep = prepareSample();
    for (const p of prep.pattern) {
      if (p.kind === "silent") {
        expect(p.amp).toBe(0);
      } else {
        expect(p.amp).toBeGreaterThan(0);
        expect(["square", "sine", "triangle", "sawtooth"]).toContain(p.oscType);
        expect(p.freq).toBeGreaterThan(0);
      }
    }
  });
});

describe("generateSampleClip (browser API gate)", () => {
  const originalMediaRecorder = (globalThis as { MediaRecorder?: unknown }).MediaRecorder;

  afterEach(() => {
    if (originalMediaRecorder === undefined) {
      delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    } else {
      (globalThis as { MediaRecorder?: unknown }).MediaRecorder = originalMediaRecorder;
    }
  });

  it("throws clearly when MediaRecorder is unavailable (e.g. jsdom)", async () => {
    delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    await expect(generateSampleClip()).rejects.toThrow(
      /MediaRecorder is not available/i,
    );
  });

  it("throws when MediaRecorder is present but supports no candidate MIME types", async () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = class {
      static isTypeSupported(): boolean {
        return false;
      }
    };
    await expect(generateSampleClip()).rejects.toThrow(
      /No supported MediaRecorder MIME type/i,
    );
  });
});
