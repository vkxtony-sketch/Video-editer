/**
 * Pure-MP4 box parser used to assert that ffmpeg.wasm produced a real
 * ISO Base Media File Format container (not an empty buffer, not an
 * arbitrary binary blob).
 *
 * An MP4 is a sequence of nested "boxes" at the top level, where every
 * box starts with a 4-byte big-endian size and a 4-byte FourCC. The two
 * boxes that MUST appear near the start of any playable MP4 are:
 *
 *   - `ftyp` (file type box) — major brand + compatible brands
 *   - `moov` (movie box)     — timing, tracks, edit lists
 *
 * Scan the top-level boxes and report their four-character codes in
 * read order. The renderer + test only needs presence/position; no
 * full ISO/IEC 14496-12 walk is required.
 */

export type Mp4Boxes = {
  /** Whether both `ftyp` and `moov` were found at the top level. */
  ok: boolean;
  /** Byte offset of the `ftyp` four-character code (or -1 if absent). */
  ftypAt: number;
  /** Byte offset of the `moov` four-character code (or -1 if absent). */
  moovAt: number;
  /** All top-level four-character codes found, in walk order. */
  brands: string[];
};

const ASCII = (codes: Uint8Array, start: number) =>
  String.fromCharCode(codes[start], codes[start + 1], codes[start + 2], codes[start + 3]);

/**
 * Walk the top-level boxes of an MP4 byte array. Generates a sequence of
 * `{ type, start }` entries one per box header, stop when we run out of
 * bytes or when a box claims a 0-byte size (loop guard for malformed input).
 */
function* boxHeaderWalker(bytes: Uint8Array): Generator<{ type: string; start: number; size: number }> {
  let offset = 0;
  const limit = bytes.byteLength;
  let safety = 0;
  while (offset + 8 <= limit && safety < 256) {
    // Read big-endian uint32 size at offset (top-level boxes are always full-box-aligned).
    const size =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    // Bail BEFORE yielding so callers don't see garbage FourCC strings
    // from bytes that sit past the last legitimate box (zeros are
    // common in synthetic test fixtures).
    if (size < 8) break;
    const type = ASCII(bytes, offset + 4);
    yield { type, start: offset + 4, size };
    offset += size;
    safety += 1;
  }
}

/**
 * Parse top-level boxes and report presence/position of `ftyp` + `moov`.
 *
 * Intentionally defensive: malformed sizes, zero-length boxes, or boxes
 * with unknown four-ccs do not throw — they simply end the walk. This
 * keeps the call site free of try/catch in render + test paths.
 */
export function parseMp4Boxes(bytes: Uint8Array): Mp4Boxes {
  const brands: string[] = [];
  let ftypAt = -1;
  let moovAt = -1;
  for (const { type, start } of boxHeaderWalker(bytes)) {
    brands.push(type);
    if (type === "ftyp" && ftypAt < 0) ftypAt = start;
    if (type === "moov" && moovAt < 0) moovAt = start;
  }
  return { ok: ftypAt >= 0 && moovAt >= 0, ftypAt, moovAt, brands };
}

/**
 * Convenience wrapper that accepts a Blob (cheap on disk: we read only
 * the first 512 KB — that's plenty of headroom for ftyp + moov, since
 * moov is typically within the first ~64 KB thanks to MP4 faststart).
 */
export async function parseMp4BoxesFromBlob(blob: Blob, maxBytes = 0x80000): Promise<Mp4Boxes> {
  // `Blob.arrayBuffer()` is widely supported (jsdom + Node 22 + every
  // modern browser) and returns the full buffer in one round-trip.
  // We then slice via a Uint8Array view to honour `maxBytes` without
  // depending on `Blob.slice(...).arrayBuffer()` (which jsdom's sliced
  // Blob doesn't expose reliably).
  const fullBuffer = await blob.arrayBuffer();
  const view = new Uint8Array(
    fullBuffer,
    0,
    Math.min(blob.size, maxBytes),
  );
  // `view` shares memory with `fullBuffer` (zero-copy slice), but
  // parseMp4Boxes only reads, never writes — safe to hand the view.
  return parseMp4Boxes(view);
}
