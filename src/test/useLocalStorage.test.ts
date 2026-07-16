import { describe, it, expect, beforeEach } from "vitest";
import {
  readPrefs,
  writePrefs,
  storageKey,
  STORAGE_PREFIX,
  DEFAULT_PREFS,
  type StudioPrefs,
} from "../lib/useLocalStorage";

const PROJECT_ID = "p_test_xyz";

describe("storageKey", () => {
  it("produces a stable, namespaced key", () => {
    expect(storageKey(PROJECT_ID)).toBe(`${STORAGE_PREFIX}${PROJECT_ID}`);
  });
});

describe("readPrefs / writePrefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns DEFAULT_PREFS when nothing is stored", () => {
    const got = readPrefs(PROJECT_ID);
    expect(got).toEqual(DEFAULT_PREFS);
  });

  it("round-trips a valid prefs object", () => {
    const p: StudioPrefs = { tab: "thumbs", highlightId: "c_1", updatedAt: 1234, preset: "ultrafast" };
    writePrefs(PROJECT_ID, p);
    expect(readPrefs(PROJECT_ID)).toEqual(p);
  });

  it("returns DEFAULT_PREFS if stored value is malformed JSON", () => {
    window.localStorage.setItem(storageKey(PROJECT_ID), "{broken");
    expect(readPrefs(PROJECT_ID)).toEqual(DEFAULT_PREFS);
  });

  it("returns DEFAULT_PREFS if stored value is not an object", () => {
    window.localStorage.setItem(storageKey(PROJECT_ID), "\"a string\"");
    expect(readPrefs(PROJECT_ID)).toEqual(DEFAULT_PREFS);
  });

  it("falls back to DEFAULT_PREFS.tab if the tab field is invalid", () => {
    window.localStorage.setItem(storageKey(PROJECT_ID), JSON.stringify({ tab: "garbage", highlightId: null }));
    const got = readPrefs(PROJECT_ID);
    expect(got.tab).toBe(DEFAULT_PREFS.tab);
  });

  it("keeps highlightId=null when stored highlightId is not a string", () => {
    window.localStorage.setItem(
      storageKey(PROJECT_ID),
      JSON.stringify({ tab: "captions", highlightId: 42 }),
    );
    const got = readPrefs(PROJECT_ID);
    expect(got.tab).toBe("captions");
    expect(got.highlightId).toBeNull();
  });

  it("writePrefs survives a quota exception without throwing", () => {
    // Force localStorage.setItem to throw, simulating Safari private mode.
    const original = window.localStorage.setItem;
    const thrower: typeof window.localStorage.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    window.localStorage.setItem = thrower;
    try {
      expect(() =>
        writePrefs(PROJECT_ID, { tab: "captions", highlightId: "c_x", updatedAt: 1, preset: "ultrafast" }),
      ).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it("isolates prefs per projectId", () => {
    writePrefs("p_a", { tab: "thumbs", highlightId: null, updatedAt: 1, preset: "ultrafast" });
    writePrefs("p_b", { tab: "captions", highlightId: "x", updatedAt: 2, preset: "ultrafast" });
    expect(readPrefs("p_a")).toEqual({ tab: "thumbs", highlightId: null, updatedAt: 1, preset: "ultrafast" });
    expect(readPrefs("p_b")).toEqual({ tab: "captions", highlightId: "x", updatedAt: 2, preset: "ultrafast" });
  });
});
