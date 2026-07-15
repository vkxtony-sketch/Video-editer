import { describe, it, expect, vi } from "vitest";
import { matchKey } from "../lib/useShortcuts";

function fakeKeyEvent(
  code: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return { code, ctrlKey: !!opts.ctrlKey, metaKey: !!opts.metaKey, altKey: !!opts.altKey, shiftKey: !!opts.shiftKey } as KeyboardEvent;
}

const ctx = {
  highlightCount: 5,
  isTextFieldFocused: () => false,
};

describe("matchKey", () => {
  it("maps Space → toggle-play", () => {
    expect(matchKey(fakeKeyEvent("Space"), ctx)).toEqual({ type: "toggle-play" });
  });
  it("maps K → toggle-play", () => {
    expect(matchKey(fakeKeyEvent("KeyK"), ctx)).toEqual({ type: "toggle-play" });
  });
  it("maps J → seek -5", () => {
    expect(matchKey(fakeKeyEvent("KeyJ"), ctx)).toEqual({ type: "seek", deltaSec: -5 });
  });
  it("maps L → seek +5", () => {
    expect(matchKey(fakeKeyEvent("KeyL"), ctx)).toEqual({ type: "seek", deltaSec: 5 });
  });
  it("maps Comma / Period → frame-step ±1", () => {
    expect(matchKey(fakeKeyEvent("Comma"), ctx)).toEqual({ type: "frame-step", direction: -1 });
    expect(matchKey(fakeKeyEvent("Period"), ctx)).toEqual({ type: "frame-step", direction: 1 });
  });
  it("maps ArrowLeft → seek -5 (and Shift+Arrow → seek -30)", () => {
    expect(matchKey(fakeKeyEvent("ArrowLeft"), ctx)).toEqual({ type: "seek", deltaSec: -5 });
    expect(matchKey(fakeKeyEvent("ArrowLeft", { shiftKey: true }), ctx)).toEqual({ type: "seek", deltaSec: -30 });
  });
  it("maps ArrowRight → seek +5 (and Shift+Arrow → seek +30)", () => {
    expect(matchKey(fakeKeyEvent("ArrowRight"), ctx)).toEqual({ type: "seek", deltaSec: 5 });
    expect(matchKey(fakeKeyEvent("ArrowRight", { shiftKey: true }), ctx)).toEqual({ type: "seek", deltaSec: 30 });
  });
  it("maps ArrowUp / ArrowDown → prev-tab / next-tab", () => {
    expect(matchKey(fakeKeyEvent("ArrowUp"), ctx)).toEqual({ type: "prev-tab" });
    expect(matchKey(fakeKeyEvent("ArrowDown"), ctx)).toEqual({ type: "next-tab" });
  });
  it("maps M / F / Home", () => {
    expect(matchKey(fakeKeyEvent("KeyM"), ctx)).toEqual({ type: "mute" });
    expect(matchKey(fakeKeyEvent("KeyF"), ctx)).toEqual({ type: "fullscreen" });
    expect(matchKey(fakeKeyEvent("Home"), ctx)).toEqual({ type: "reset-scrub" });
  });
  it("maps Digit1..9 → select-highlight N-1 (if present)", () => {
    for (let i = 1; i <= 9; i++) {
      const code = `Digit${i}`;
      const expect_ = i - 1 < ctx.highlightCount;
      const got = matchKey(fakeKeyEvent(code), ctx);
      if (expect_) {
        expect(got).toEqual({ type: "select-highlight", index: i - 1 });
      } else {
        expect(got).toBeNull();
      }
    }
  });
  it("returns null for unknown keys", () => {
    expect(matchKey(fakeKeyEvent("KeyX"), ctx)).toBeNull();
    expect(matchKey(fakeKeyEvent("KeyZ"), ctx)).toBeNull();
  });
  it("ignores Ctrl/Cmd/Alt-modified shortcuts", () => {
    expect(matchKey(fakeKeyEvent("Space", { ctrlKey: true }), ctx)).toBeNull();
    expect(matchKey(fakeKeyEvent("KeyK", { metaKey: true }), ctx)).toBeNull();
    expect(matchKey(fakeKeyEvent("KeyL", { altKey: true }), ctx)).toBeNull();
  });
  it("ignores when an input element has focus", () => {
    const ctx2 = { highlightCount: 5, isTextFieldFocused: () => true };
    expect(matchKey(fakeKeyEvent("Space"), ctx2)).toBeNull();
    expect(matchKey(fakeKeyEvent("KeyJ"), ctx2)).toBeNull();
    expect(matchKey(fakeKeyEvent("KeyL"), ctx2)).toBeNull();
  });
  it("is callable in isolation (no global state pollution)", () => {
    const spy = vi.fn();
    spy(matchKey(fakeKeyEvent("Space"), ctx));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toEqual({ type: "toggle-play" });
  });
});
