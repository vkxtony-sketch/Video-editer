// urlFetch.ts — Validate a public video URL and turn the response into a
// File that the existing real ingest pipeline (`analyzeAndIngest` in
// `pipelineClient.ts`) can already process. This is what powers the
// "Video URL" source path on the dashboard — previously this branch
// also fell through to the server-side mock pipeline, which produced
// fake artifacts.
//
// What this module does:
//   - Validates the URL: must be http/https, must NOT be an HLS/DASH
//     playlist (`.m3u8` / `.mpd` are playlists of segments, not videos).
//   - Does a streaming GET with `redirect: "follow"` and rejects HTTP
//     errors with a friendly message.
//   - Reads `Content-Length` so we can fail FAST on >500 MB responses
//     rather than letting the browser OOM.
//   - Streams the body with a manual byte cap, so a missing or
//     misreported `Content-Length` can't blow past the budget.
//   - Sniffs the first 4 bytes: rejects HTML responses (some servers
//     redirect an unauthenticated request to a login page that returns
//     a 200 with `text/html` content, which would otherwise crash
//     `decodeAudioData` downstream).
//
// What it does NOT do:
//   - Bypass CORS — many video CDNs refuse cross-origin reads, which
//     surfaces as `TypeError` from fetch. We translate that into a
//     human-readable "likely a CORS block" message instead of letting
//     the failure cascade into a confusing "decodeAudioData failed".
//   - Support playlists or live streams. Both require separate
//     downloading + demux-work that lives outside this module.
//   - Persist the cache. Each call refetches.

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

export type ValidateResult =
  | { ok: true; url: URL; filename: string; contentType: string }
  | { ok: false; error: string };

export type ProgressEvent =
  | { phase: "headers" }
  | { phase: "stream"; bytesLoaded: number; bytesTotal: number }
  | { phase: "sniff" }
  | { phase: "done" };

export type FetchUrlOptions = {
  /** Hard upper bound on bytes we will buffer. Default: 500 MB. */
  maxBytes?: number;
  /** Plug a custom fetch (used in tests) — defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Caller-supplied abort signal. */
  signal?: AbortSignal;
  /** Per-byte progress callback. */
  onProgress?: (e: ProgressEvent) => void;
};

/**
 * Cheap synchronous check before we issue any network I/O.
 */
export function validateVideoUrl(raw: string): ValidateResult {
  if (!raw || !raw.trim()) {
    return { ok: false, error: "URL is empty" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Not a valid URL — must start with http:// or https://" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      error: `Unsupported protocol "${url.protocol}" — only http/https work in the browser`,
    };
  }
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8") || path.includes(".m3u8?")) {
    return {
      ok: false,
      error: "HLS playlists (.m3u8) aren't supported here — paste a direct MP4/WebM URL instead",
    };
  }
  if (path.endsWith(".mpd") || path.includes(".mpd?")) {
    return {
      ok: false,
      error: "DASH manifests (.mpd) aren't supported here — paste a direct MP4/WebM URL instead",
    };
  }
  // Best-effort filename: last path segment. Fall back to a generic
  // remote-video.{ext}; we refine the extension after the fetch by
  // sniffing Content-Type.
  const lastSeg = path.split("/").filter(Boolean).pop() ?? "";
  const filename = lastSeg && /\.[a-z0-9]{2,5}$/i.test(lastSeg)
    ? lastSeg
    : "remote-video.mp4";
  return { ok: true, url, filename, contentType: "video/mp4" };
}

/**
 * Fetch the URL and return a File. Throws Error with a user-readable
 * message on any failure (validation, network, CORS, size cap, bad
 * content type).
 */
export async function fetchUrlAsVideoFile(
  raw: string,
  opts: FetchUrlOptions = {},
): Promise<File> {
  const v = validateVideoUrl(raw);
  if (!v.ok) throw new Error(v.error);
  const fetcher = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const cap = opts.maxBytes ?? MAX_VIDEO_BYTES;
  opts.onProgress?.({ phase: "headers" });

  let resp: Response;
  try {
    resp = await fetcher(v.url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: opts.signal,
    });
  } catch (e) {
    const isCors =
      e instanceof TypeError || /failed to fetch|networkerror/i.test(String(e));
    const msg = isCors
      ? "Could not fetch the URL — likely a CORS block. The server must allow cross-origin reads (Access-Control-Allow-Origin). Try a host that serves CORS-enabled files, like CDN buckets you control."
      : `Network error fetching the URL: ${e instanceof Error ? e.message : String(e)}`;
    throw new Error(msg);
  }
  if (!resp.ok) {
    throw new Error(
      `Server returned HTTP ${resp.status} ${resp.statusText || ""}`.trim(),
    );
  }
  if (!resp.body) {
    throw new Error("Empty response body — server must return a streamable video file");
  }

  // Pre-check size from Content-Length if present, so big files fail fast.
  const declaredLen = parseContentLength(resp.headers.get("Content-Length"));
  if (declaredLen !== null && declaredLen > cap) {
    throw new Error(
      `Remote file is ${(declaredLen / 1024 / 1024).toFixed(0)} MB; the in-browser pipeline caps at ${(cap / 1024 / 1024).toFixed(0)} MB.`,
    );
  }

  // Stream-read so a missing/misreported Content-Length can't blow past the
  // budget (chunk-accumulate into a single Blob at the end).
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = resp.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new Error(
          `Remote file exceeded ${(cap / 1024 / 1024).toFixed(0)} MB before completion — capped to protect browser memory.`,
        );
      }
      chunks.push(value);
      opts.onProgress?.({
        phase: "stream",
        bytesLoaded: total,
        bytesTotal: declaredLen ?? total,
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("exceeded")) throw e;
    throw new Error(`Stream interrupted while reading the URL: ${e instanceof Error ? e.message : String(e)}`);
  }
  opts.onProgress?.({ phase: "sniff" });

  // Sniff the first 4 bytes so we can bail on HTML responses (e.g. login
  // page redirects that some hosts return on missing auth).
  const sniff = new Uint8Array(chunks[0]?.slice(0, 4) ?? new Uint8Array(0));
  const isHtml =
    sniff.length >= 4 &&
    sniff[0] === 0x3c /* < */ &&
    sniff[1] !== undefined &&
    (sniff[1] === 0x21 /* ! */ ||
      sniff[1] === 0x68 /* h */ ||
      sniff[1] === 0x48 /* H */);
  if (isHtml) {
    throw new Error(
      `Server returned HTML instead of a video. The URL may redirect to a sign-in or error page. (First bytes: "${String.fromCharCode(...sniff.slice(0, 4))}")`,
    );
  }

  // Refine the file extension from the actual Content-Type response header.
  const ctRaw = resp.headers.get("Content-Type") ?? "video/mp4";
  const ct = ctRaw.toLowerCase().split(";")[0]?.trim() ?? "video/mp4";
  const ext = ct.includes("webm")
    ? "webm"
    : ct.includes("quicktime")
      ? "mov"
      : ct.includes("matroska") || ct.includes("mkv")
        ? "mkv"
        : "mp4";
  const finalName = /\.[a-z0-9]{2,5}$/i.test(v.filename)
    ? v.filename.replace(/\.[a-z0-9]{2,5}$/i, "." + ext)
    : `remote-video.${ext}`;

  const blob = new Blob(chunks as BlobPart[], { type: ct });
  opts.onProgress?.({ phase: "done" });
  return new File([blob], finalName, { type: ct });
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
