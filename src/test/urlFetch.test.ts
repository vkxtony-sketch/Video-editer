import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateVideoUrl,
  fetchUrlAsVideoFile,
  MAX_VIDEO_BYTES,
} from "../lib/urlFetch";

describe("validateVideoUrl", () => {
  it("rejects empty input", () => {
    expect(validateVideoUrl("")).toEqual({ ok: false, error: expect.any(String) });
    expect(validateVideoUrl("   ")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects non-URL strings", () => {
    const r = validateVideoUrl("not a url");
    expect(r.ok).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(validateVideoUrl("ftp://example.com/foo.mp4").ok).toBe(false);
    expect(validateVideoUrl("file:///tmp/video.mp4").ok).toBe(false);
    expect(validateVideoUrl("data:video/mp4;base64,AAA").ok).toBe(false);
  });

  it("rejects HLS .m3u8 playlists", () => {
    const r = validateVideoUrl("https://example.com/playlist.m3u8");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/HLS/i);
  });

  it("rejects DASH .mpd manifests", () => {
    const r = validateVideoUrl("https://example.com/manifest.mpd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/DASH/i);
  });

  it("accepts a plain https MP4 URL and preserves filename", () => {
    const r = validateVideoUrl("https://cdn.example.com/intro.mp4?token=abc");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.hostname).toBe("cdn.example.com");
      expect(r.filename).toBe("intro.mp4");
    }
  });

  it("falls back to remote-video.mp4 when no segment matches", () => {
    const r = validateVideoUrl("https://example.com/");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.filename).toBe("remote-video.mp4");
  });
});

/**
 * Build a fake `Response` compatible with `fetchUrlAsVideoFile`'s
 * streaming reader. We deliberately model minimal subset (`ok`,
 * `status`, `body` with `getReader`) plus `headers.get`. Each chunk
 * becomes one Uint8Array out of `body.getReader().read()`.
 */
function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  contentLength?: number | null;
  bodyBytes?: Uint8Array;
}) {
  const ok = opts.ok ?? true;
  const status = opts.status ?? 200;
  const statusText = opts.statusText ?? "OK";
  const headers = new Map<string, string>();
  if (opts.contentType) headers.set("Content-Type", opts.contentType);
  if (opts.contentLength != null) headers.set("Content-Length", String(opts.contentLength));
  const bytes = opts.bodyBytes ?? new Uint8Array([0, 0, 0, 0x18]); // a benign non-HTMP sniff
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return {
    ok,
    status,
    statusText,
    headers: {
      get: (k: string) => headers.get(k) ?? null,
    },
    body: stream,
  } as unknown as Response;
}

describe("fetchUrlAsVideoFile (synthetic fetch)", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects oversized Content-Length up front", async () => {
    const fake = fakeResponse({
      contentType: "video/mp4",
      contentLength: MAX_VIDEO_BYTES + 1,
      bodyBytes: new Uint8Array([0, 0, 0, 0x18]),
    });
    globalThis.fetch = vi.fn(async () => fake) as unknown as typeof fetch;
    await expect(fetchUrlAsVideoFile("https://example.com/big.mp4")).rejects.toThrow(
      /Remote file is.*MB; the in-browser pipeline caps at/i,
    );
  });

  it("rejects HTTP errors with status code in the message", async () => {
    const fake = fakeResponse({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    globalThis.fetch = vi.fn(async () => fake) as unknown as typeof fetch;
    await expect(fetchUrlAsVideoFile("https://example.com/x.mp4")).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it("rejects HTML-shaped responses (login-page redirects)", async () => {
    const htmlStart = new Uint8Array([0x3c, 0x21, 0x44, 0x4f]); // "<!DO..."
    const fake = fakeResponse({
      contentType: "text/html",
      bodyBytes: htmlStart,
    });
    globalThis.fetch = vi.fn(async () => fake) as unknown as typeof fetch;
    await expect(fetchUrlAsVideoFile("https://example.com/x.mp4")).rejects.toThrow(
      /HTML instead of a video/i,
    );
  });

  it("returns a File with the correct MIME-derived extension on happy path", async () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, // size
      0x66, 0x74, 0x79, 0x70, // "ftyp"
      0x00, 0x00, 0x00, 0x00,
    ]);
    const fake = fakeResponse({
      contentType: "video/mp4",
      contentLength: bytes.byteLength,
      bodyBytes: bytes,
    });
    globalThis.fetch = vi.fn(async () => fake) as unknown as typeof fetch;
    const file = await fetchUrlAsVideoFile("https://example.com/intro.mp4");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toMatch(/\.mp4$/);
    expect(file.type).toBe("video/mp4");
    expect(file.size).toBe(bytes.byteLength);
  });

  it("translates a fetch TypeError into a CORS-friendly message", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchUrlAsVideoFile("https://example.com/x.mp4")).rejects.toThrow(
      /CORS|Allow-Control-Allow-Origin/i,
    );
  });
});
