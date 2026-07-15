import { describe, it, expect } from "vitest";
import {
  readUrlState,
  buildUrlState,
  URL_PARAM_TAB,
  URL_PARAM_HIGHLIGHT,
  URL_PARAM_SCRUB,
} from "../lib/urlStudioState";

describe("urlStudioState", () => {
  describe("readUrlState", () => {
    it("parses a full sharable link", () => {
      const u = readUrlState(
        `?${URL_PARAM_TAB}=captions&${URL_PARAM_HIGHLIGHT}=c_42&${URL_PARAM_SCRUB}=318`,
      );
      expect(u.tab).toBe("captions");
      expect(u.highlightId).toBe("c_42");
      expect(u.scrubToSec).toBe(318);
    });

    it("returns null fields for an unrecognized tab", () => {
      const u = readUrlState(`?${URL_PARAM_TAB}=not-a-real-tab`);
      expect(u.tab).toBeNull();
      expect(u.highlightId).toBeNull();
      expect(u.scrubToSec).toBeNull();
    });

    it("clamps scrub negative / non-numeric to null or 0", () => {
      expect(readUrlState(`?${URL_PARAM_SCRUB}=-12`).scrubToSec).toBe(0);
      expect(readUrlState(`?${URL_PARAM_SCRUB}=abc`).scrubToSec).toBe(0);
      expect(readUrlState(`?${URL_PARAM_SCRUB}=0`).scrubToSec).toBe(0);
    });

    it("floors fractional scrub values", () => {
      expect(readUrlState(`?${URL_PARAM_SCRUB}=12.7`).scrubToSec).toBe(12);
    });

    it("returns null highlight if empty string is provided", () => {
      const u = readUrlState(`?${URL_PARAM_HIGHLIGHT}=`);
      expect(u.highlightId).toBeNull();
    });

    it("handles missing param key gracefully", () => {
      const u = readUrlState("");
      expect(u).toEqual({ tab: null, highlightId: null, scrubToSec: null });
    });
  });

  describe("buildUrlState", () => {
    it("builds a canonical sharable querystring", () => {
      expect(
        buildUrlState({
          tab: "thumbs",
          highlightId: "h_9",
          scrubToSec: 240,
        }),
      ).toBe("?tab=thumbs&h=h_9&t=240");
    });

    it("omits zero / null scrub values for a cleaner URL", () => {
      expect(
        buildUrlState({ tab: "titles", highlightId: null, scrubToSec: 0 }),
      ).toBe("?tab=titles");
    });

    it("round-trips readUrlState ↔ buildUrlState", () => {
      const built = buildUrlState({
        tab: "captions",
        highlightId: "clip_77",
        scrubToSec: 90,
      });
      const parsed = readUrlState(built);
      expect(parsed.tab).toBe("captions");
      expect(parsed.highlightId).toBe("clip_77");
      expect(parsed.scrubToSec).toBe(90);
    });
  });
});
