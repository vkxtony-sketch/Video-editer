import { describe, expect, test } from "vitest";
import { parseMp4Boxes, parseMp4BoxesFromBlob } from "@/lib/ffmpeg/mp4Validator";

/**
 * Build a 64-byte synthetic MP4 buffer with `ftyp` at offset 4 and
 * `moov` at offset 36 — enough headroom to assert present-position
 * behaviour without spinning up a real encoder. Layout:
 *
 *   [0..3]   size = 32 (big-endian)
 *   [4..7]   "ftyp"
 *   [8..11]  "isom"  (major brand)
 *   [12..15] minor version (0x00000200)
 *   [16..31] 4 compatible brands
 *   [32..35] size = 8
 *   [36..39] "moov"
 *   [40..63] 24 bytes zero padding
 */
function syntheticMp4(): Uint8Array {
  const buf = new Uint8Array(64);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 32);
  buf.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
  buf.set([0x69, 0x73, 0x6f, 0x6d], 8); // 'isom'
  // minor version (12..15) left as 0 — works for presence detection.
  buf.set([0x69, 0x73, 0x6f, 0x6d], 16);
  buf.set([0x69, 0x73, 0x6f, 0x32], 20);
  buf.set([0x61, 0x76, 0x63, 0x31], 24);
  buf.set([0x6d, 0x70, 0x34, 0x31], 28);
  dv.setUint32(32, 8);
  buf.set([0x6d, 0x6f, 0x6f, 0x76], 36); // 'moov'
  return buf;
}

describe("parseMp4Boxes (ftyp + moov presence)", () => {
  test("detects both ftyp and moov in a 64-byte synthetic container", () => {
    const result = parseMp4Boxes(syntheticMp4());
    expect(result.ok).toBe(true);
    expect(result.ftypAt).toBe(4);
    expect(result.moovAt).toBe(36);
    expect(result.brands).toEqual(["ftyp", "moov"]);
  });

  test("returns ok=false when ftyp is missing", () => {
    const buf = new Uint8Array(64);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 8);
    buf.set([0x6d, 0x6f, 0x6f, 0x76], 4); // moov only
    const result = parseMp4Boxes(buf);
    expect(result.ok).toBe(false);
    expect(result.ftypAt).toBe(-1);
    expect(result.moovAt).toBe(4);
    expect(result.brands).toEqual(["moov"]);
  });

  test("returns ok=false when moov is missing", () => {
    const buf = new Uint8Array(64);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 32);
    buf.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp only
    buf.set([0x69, 0x73, 0x6f, 0x6d], 8);
    const result = parseMp4Boxes(buf);
    expect(result.ok).toBe(false);
    expect(result.ftypAt).toBe(4);
    expect(result.moovAt).toBe(-1);
  });

  test("returns ok=false on an empty buffer without throwing", () => {
    const result = parseMp4Boxes(new Uint8Array(0));
    expect(result.ok).toBe(false);
    expect(result.ftypAt).toBe(-1);
    expect(result.moovAt).toBe(-1);
    expect(result.brands).toEqual([]);
  });

  test("stops on a malformed size=0 box without looping forever", () => {
    const buf = new Uint8Array(16);
    new DataView(buf.buffer).setUint32(0, 0); // size=0 → loop guard trips
    const result = parseMp4Boxes(buf);
    // The walker bails before yielding anything: ok stays false and
    // we get no spurious "garbage FourCC" boxes from bytes that sit
    // past the malformed header.
    expect(result.ok).toBe(false);
    expect(result.ftypAt).toBe(-1);
    expect(result.moovAt).toBe(-1);
  });

  test("parseMp4BoxesFromBlob accepts a Blob and returns the same shape", async () => {
    const bytes = syntheticMp4();
    const blob = new Blob([bytes as BlobPart], { type: "video/mp4" });
    const result = await parseMp4BoxesFromBlob(blob);
    expect(result.ok).toBe(true);
    expect(result.ftypAt).toBe(4);
    expect(result.moovAt).toBe(36);
  });
});
