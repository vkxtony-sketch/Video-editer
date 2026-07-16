/**
 * Public surface of the browser-side FFmpeg renderer. Studio imports
 * from `@/lib/ffmpeg` and never has to know about the per-file
 * module layout, which keeps the integration point trivial to mock.
 */
export {
  renderHighlightReel,
  BROWSER_RENDER_MAX_SEC,
  isWithinBrowserRenderBudget,
} from "./renderReel";
export type { RenderReelOptions } from "./renderReel";

export { buildConcatArgs } from "./filterGraph";
export type { ConcatArgs } from "./filterGraph";

export { parseMp4Boxes, parseMp4BoxesFromBlob } from "./mp4Validator";
export type { Mp4Boxes } from "./mp4Validator";
