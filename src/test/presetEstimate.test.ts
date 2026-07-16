import { describe, it, expect } from "vitest";
import {
  PRESET_PROFILES,
  estimateRender,
  formatEstimate,
} from "../lib/ffmpeg/presetEstimate";

describe("presetEstimate", () => {
  describe("PRESET_PROFILES", () => {
    it("exposes exactly the four shipped presets", () => {
      expect(Object.keys(PRESET_PROFILES).sort()).toEqual(
        ["medium", "superfast", "ultrafast", "veryfast"],
      );
    });

    it("ultrafast is the fastest preset with the largest bitrate", () => {
      const u = PRESET_PROFILES.ultrafast;
      const m = PRESET_PROFILES.medium;
      expect(u.encodeSpeedFactor).toBeLessThan(m.encodeSpeedFactor);
      expect(u.bitrateMbps).toBeGreaterThan(m.bitrateMbps);
    });

    it("encode-speed increases monotonically as bitrate drops", () => {
      // ultrafast → superfast → veryfast → medium: faster → slower (encode)
      expect(PRESET_PROFILES.ultrafast.encodeSpeedFactor).toBeLessThan(
        PRESET_PROFILES.superfast.encodeSpeedFactor,
      );
      expect(PRESET_PROFILES.superfast.encodeSpeedFactor).toBeLessThan(
        PRESET_PROFILES.veryfast.encodeSpeedFactor,
      );
      expect(PRESET_PROFILES.veryfast.encodeSpeedFactor).toBeLessThan(
        PRESET_PROFILES.medium.encodeSpeedFactor,
      );
    });
  });

  describe("estimateRender", () => {
    it("returns zeros for the empty case without throwing", () => {
      const r = estimateRender({ preset: "ultrafast", clipCount: 0, totalSec: 0 });
      expect(r).toEqual({
        preset: "ultrafast",
        clipCount: 0,
        totalSec: 0,
        avgSecPerClip: 0,
        outputMB: 0,
        encodeSec: 0,
      });
    });

    it("computes the ultrafast 12-clip × 6s avg prediction", () => {
      // 12 clips × 6s = 72s reel @ 5 Mbps (0.625 MB/s) → 45 MB encode @ 0.25× = 18s
      const r = estimateRender({
        preset: "ultrafast",
        clipCount: 12,
        totalSec: 72,
      });
      expect(r.avgSecPerClip).toBeCloseTo(6, 5);
      expect(r.outputMB).toBeCloseTo(45, 1);
      expect(r.encodeSec).toBe(18);
    });

    it("medium preset trades 4× encode time for ~3× smaller file", () => {
      const u = estimateRender({ preset: "ultrafast", clipCount: 12, totalSec: 72 });
      const m = estimateRender({ preset: "medium", clipCount: 12, totalSec: 72 });
      // 1.5 Mbps vs 5 Mbps ⇒ ~3.3× smaller
      expect(u.outputMB / m.outputMB).toBeGreaterThan(3);
      // 0.25× vs 2.5× ⇒ 10× slower
      expect(m.encodeSec).toBeGreaterThan(u.encodeSec * 5);
    });

    it("clamps negative / NaN inputs to zero without crashing", () => {
      const r = estimateRender({
        preset: "superfast",
        clipCount: -3,
        totalSec: Number.NaN,
      });
      expect(r.clipCount).toBe(0);
      expect(r.totalSec).toBe(0);
      expect(r.outputMB).toBe(0);
      expect(r.encodeSec).toBe(0);
    });

    it("floors fractional clipCount (defensive math)", () => {
      const r = estimateRender({ preset: "veryfast", clipCount: 7.9, totalSec: 30 });
      expect(r.clipCount).toBe(7);
      expect(r.totalSec).toBe(30);
    });
  });

  describe("formatEstimate", () => {
    it("returns the dash placeholder when there are no clips", () => {
      const r = estimateRender({ preset: "ultrafast", clipCount: 0, totalSec: 0 });
      expect(formatEstimate(r)).toBe("—");
    });

    it("renders the full legend string with count / avg / size / encode", () => {
      const r = estimateRender({ preset: "ultrafast", clipCount: 12, totalSec: 72 });
      const out = formatEstimate(r);
      // 5 Mbps × 72s ÷ 8 = 45.0 MB; encode @ 0.25× = 18s
      expect(out).toMatch(/^12 clips × ~6s avg → ~45\.0 MB · 18s encode/);
      expect(out).toMatch(/\(est\. 720p30\)/);
    });

    it("switches encode label to minutes for long reels", () => {
      const r = estimateRender({ preset: "medium", clipCount: 30, totalSec: 240 });
      // 240s × 2.5 = 600s → 10 min encode
      expect(formatEstimate(r)).toMatch(/10 min encode/);
    });

    it("renders KB when the predicted output is under 1 MB", () => {
      // 1s @ 1.5 Mbps ÷ 8 ≈ 0.19 MB → switch to KB branch
      const r = estimateRender({ preset: "medium", clipCount: 1, totalSec: 1 });
      expect(formatEstimate(r)).toMatch(/KB/);
    });
  });
});
