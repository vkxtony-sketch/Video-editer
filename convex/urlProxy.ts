"use node";
// Generic public-URL video proxy.
//
// Browsers cannot fetch arbitrary remote videos because most servers do not
// send Access-Control-Allow-Origin headers. This action fetches the URL in
// Convex's Node.js runtime, stores the blob in Convex Storage, and returns a
// storage URL that the browser can read without CORS issues.
//
// Notes:
//   - We cap downloads at 500 MB to stay within Convex Action memory limits.
//   - We reject non-HTTP(S) URLs, HLS/DASH playlists, and non-2xx responses.
//   - The returned storage URL is valid for ~30 minutes by default; the
//     analysis pipeline consumes it immediately.

import { v } from "convex/values";
import { action } from "./_generated/server";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export const fetchAndStore = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const raw = args.url.trim();
    if (!raw) {
      throw new Error("URL is empty");
    }

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("Not a valid URL — must start with http:// or https://");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol "${url.protocol}"`);
    }

    const path = url.pathname.toLowerCase();
    if (path.endsWith(".m3u8") || path.includes(".m3u8?")) {
      throw new Error(
        "HLS playlists (.m3u8) aren't supported — paste a direct MP4/WebM URL instead",
      );
    }
    if (path.endsWith(".mpd") || path.includes(".mpd?")) {
      throw new Error(
        "DASH manifests (.mpd) aren't supported — paste a direct MP4/WebM URL instead",
      );
    }

    const response = await fetch(raw, {
      method: "GET",
      redirect: "follow",
      headers: {
        // Be a polite generic client so CDNs serve the file.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Server returned HTTP ${response.status} ${response.statusText || ""}`.trim(),
      );
    }

    const declaredLen = parseContentLength(response.headers.get("Content-Length"));
    if (declaredLen !== null && declaredLen > MAX_BYTES) {
      throw new Error(
        `Remote file is ${(declaredLen / 1024 / 1024).toFixed(0)} MB; the proxy caps at ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      );
    }

    if (!response.body) {
      throw new Error("Empty response body — server must return a streamable video file");
    }

    // Stream-read with a hard byte cap so a missing/misreported Content-Length
    // can't exhaust memory.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          throw new Error(
            `Remote file exceeded ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB before completion — capped to protect server memory.`,
          );
        }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("exceeded")) throw e;
      throw new Error(
        `Stream interrupted while reading the URL: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const ctRaw = response.headers.get("Content-Type") ?? "video/mp4";
    const ct = ctRaw.toLowerCase().split(";")[0]?.trim() ?? "video/mp4";
    const blob = new Blob(chunks as BlobPart[], { type: ct });

    const storageId = await ctx.storage.store(blob);
    const storageUrl = await ctx.storage.getUrl(storageId);
    if (!storageUrl) {
      throw new Error("Failed to generate Convex Storage URL");
    }

    return {
      storageUrl,
      contentType: ct,
      sizeBytes: total,
    };
  },
});

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
