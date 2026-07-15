// Shareable URL state for the Studio page.
//
// Encodes {tab, highlightId, scrubToSec} into `?tab=titles&h=...&t=...` so a
// user can copy a link to the exact view they're looking at (e.g. "send me
// the clip at minute 7 of the Captions tab").
//
// We intentionally drive UI state in React and only call
// `history.replaceState` (no router navigation, no extra re-renders) when
// that state changes. This matches what professional tools (Frame.io,
// Premiere web, YouTube Studio) do — tying high-frequency scrub updates to
// the router would jank the playback timeline at 60fps.

import type { StudioTab } from "./useLocalStorage";

const TAB_ORDER: StudioTab[] = ["titles", "thumbs", "captions"];

export const URL_PARAM_TAB = "tab";
export const URL_PARAM_HIGHLIGHT = "h";
export const URL_PARAM_SCRUB = "t";

export type UrlState = {
  tab: StudioTab | null;
  highlightId: string | null;
  scrubToSec: number | null;
};

/**
 * Read tab/highlight/scrub from the given querystring (or current window
 * location if omitted). Returns `null` for any unknown or invalid value so
 * the caller can fall back gracefully.
 */
export function readUrlState(search?: string): UrlState {
  let params: URLSearchParams;
  if (typeof search === "string") {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } else if (typeof window !== "undefined") {
    params = new URLSearchParams(window.location.search);
  } else {
    return { tab: null, highlightId: null, scrubToSec: null };
  }
  const rawTab = params.get(URL_PARAM_TAB);
  const tab: StudioTab | null =
    rawTab && (TAB_ORDER as string[]).includes(rawTab)
      ? (rawTab as StudioTab)
      : null;
  const highlight = params.get(URL_PARAM_HIGHLIGHT);
  const scrubRaw = params.get(URL_PARAM_SCRUB);
  const scrubNum = scrubRaw == null ? null : Number(scrubRaw) || 0;
  const scrub =
    scrubNum == null ? null : Math.max(0, Math.floor(scrubNum));
  return {
    tab,
    highlightId: highlight && highlight.length > 0 ? highlight : null,
    scrubToSec: scrub != null && Number.isFinite(scrub) ? scrub : null,
  };
}

/**
 * Build a `?tab=...&h=...&t=...` querystring for the current view state.
 * `scrubToSec <= 0` and `null` values are omitted to keep the URL short.
 */
export function buildUrlState(opts: {
  tab: StudioTab;
  highlightId: string | null;
  scrubToSec: number | null;
}): string {
  const params = new URLSearchParams();
  if (opts.tab) params.set(URL_PARAM_TAB, opts.tab);
  if (opts.highlightId) params.set(URL_PARAM_HIGHLIGHT, opts.highlightId);
  if (opts.scrubToSec != null && opts.scrubToSec > 0) {
    params.set(URL_PARAM_SCRUB, String(Math.floor(opts.scrubToSec)));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export { TAB_ORDER };
