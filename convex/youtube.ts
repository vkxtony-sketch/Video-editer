"use node";
// YouTube ingestion backend.
//
// Browsers cannot fetch YouTube directly (CORS + bot protection), so we
// resolve the video in Convex's Node.js runtime, download the stream, and
// store it in Convex Storage. The storage URL is served with permissive
// CORS headers, so the existing client-side `fetchUrlAsVideoFile` and
// `analyzeAndIngest` pipeline can consume it just like any public MP4.
//
// Notes:
//   - We request the lowest-quality audio+video format to keep memory use
//     within Convex Action limits (short/medium videos only).
//   - Live streams, age-restricted videos, and very long videos may still
//     fail; the client surfaces the error message.

import { v } from "convex/values";
import { action } from "./_generated/server";
import ytdl from "@distube/ytdl-core";

export const fetchAndStore = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const url = args.url.trim();
    if (!ytdl.validateURL(url)) {
      throw new Error("Invalid YouTube URL");
    }

    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, {
      filter: "audioandvideo",
      quality: "lowest",
    });

    if (!format || !format.url) {
      throw new Error("No downloadable audio+video format found for this URL");
    }

    // Download the resolved stream. Using Node's fetch lets us avoid
    // piping through ytdl's stream (which can be slow to start) and gives
    // us a Blob we can hand straight to Convex Storage.
    const response = await fetch(format.url, {
      headers: {
        // Pretend to be a browser so YouTube's CDN serves the file.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(
        `YouTube download failed: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("YouTube returned an empty response body");
    }

    const blob = await response.blob();
    const storageId = await ctx.storage.store(blob);
    const storageUrl = await ctx.storage.getUrl(storageId);

    if (!storageUrl) {
      throw new Error("Failed to generate Convex Storage URL");
    }

    return {
      storageUrl,
      title: info.videoDetails.title,
      durationSec: Number(info.videoDetails.lengthSeconds) || 0,
      thumbnail:
        info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]
          ?.url,
    };
  },
});
