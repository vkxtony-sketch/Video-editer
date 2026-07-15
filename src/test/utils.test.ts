import { describe, it, expect } from "vitest";
import { formatTimestamp, clamp } from "../lib/utils";

describe("formatTimestamp", () => {
  it("formats 0 seconds", () => {
    expect(formatTimestamp(0)).toBe("00:00:00");
  });
  it("formats 45 seconds", () => {
    expect(formatTimestamp(45)).toBe("00:00:45");
  });
  it("formats 90 minutes", () => {
    expect(formatTimestamp(90 * 60)).toBe("01:30:00");
  });
  it("formats 12 hours", () => {
    expect(formatTimestamp(12 * 3600)).toBe("12:00:00");
  });
  it("returns 00:00:00 for negative or non-finite", () => {
    expect(formatTimestamp(-1)).toBe("00:00:00");
    expect(formatTimestamp(Number.NaN)).toBe("00:00:00");
  });
});

describe("clamp", () => {
  it("clamps below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it("clamps above max", () => {
    expect(clamp(20, 0, 10)).toBe(10);
  });
  it("passes through in-range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
