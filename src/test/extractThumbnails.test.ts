import { describe, it, expect, vi } from "vitest";
import { jpegFromCanvas } from "../lib/videoAnalysis";

describe("jpegFromCanvas", () => {
  it("encodes the canvas as JPEG via toDataURL with the given quality", () => {
    const stub = vi.fn(() => "data:image/jpeg;base64,/9j/abc123");
    const canvas = { toDataURL: stub } as unknown as HTMLCanvasElement;
    const out = jpegFromCanvas(canvas, 0.6);
    expect(out).toBe("data:image/jpeg;base64,/9j/abc123");
    expect(stub).toHaveBeenCalledTimes(1);
    expect(stub).toHaveBeenCalledWith("image/jpeg", 0.6);
  });

  it("defaults to 0.7 quality when no quality arg is passed", () => {
    const stub = vi.fn(() => "data:image/jpeg;base64,xyz");
    const canvas = { toDataURL: stub } as unknown as HTMLCanvasElement;
    jpegFromCanvas(canvas);
    expect(stub).toHaveBeenCalledWith("image/jpeg", 0.7);
  });
});