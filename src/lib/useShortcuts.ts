// Industry-standard video-editor keyboard shortcuts for the Studio page.
// The pure `matchKey` function is exported separately so it can be unit-tested
// in isolation (no React, no DOM) — see `src/test/shortcuts.test.ts`.

import { useEffect } from "react";

export type ShortcutAction =
  | { type: "toggle-play" }
  | { type: "seek"; deltaSec: number }
  | { type: "frame-step"; direction: 1 | -1 }
  | { type: "select-highlight"; index: number }
  | { type: "mute" }
  | { type: "fullscreen" }
  | { type: "next-tab" }
  | { type: "prev-tab" }
  | { type: "reset-scrub" };

export type ShortcutContext = {
  highlightCount: number;
  isTextFieldFocused: () => boolean;
};

/**
 * Pure key → action mapper. Given a `KeyboardEvent` and a context, returns
 * the matching action or `null` if the key should be ignored.
 */
export function matchKey(
  e: KeyboardEvent,
  ctx: ShortcutContext,
): ShortcutAction | null {
  // Ignore when any text input has focus.
  if (ctx.isTextFieldFocused()) return null;
  // Ignore modified keys (we want raw shortcuts, not browser defaults).
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  const code = e.code;
  switch (code) {
    case "Space":
      return { type: "toggle-play" };
    case "KeyK":
      return { type: "toggle-play" };
    case "KeyJ":
      return { type: "seek", deltaSec: -5 };
    case "KeyL":
      return { type: "seek", deltaSec: 5 };
    case "Comma":
      return { type: "frame-step", direction: -1 };
    case "Period":
      return { type: "frame-step", direction: 1 };
    case "ArrowLeft":
      return { type: "seek", deltaSec: e.shiftKey ? -30 : -5 };
    case "ArrowRight":
      return { type: "seek", deltaSec: e.shiftKey ? 30 : 5 };
    case "ArrowUp":
      return { type: "prev-tab" };
    case "ArrowDown":
      return { type: "next-tab" };
    case "KeyM":
      return { type: "mute" };
    case "KeyF":
      return { type: "fullscreen" };
    case "Home":
      return { type: "reset-scrub" };
    case "Digit1":
    case "Digit2":
    case "Digit3":
    case "Digit4":
    case "Digit5":
    case "Digit6":
    case "Digit7":
    case "Digit8":
    case "Digit9": {
      const index = Number(code.slice(5)) - 1;
      if (index < ctx.highlightCount) return { type: "select-highlight", index };
      return null;
    }
    default:
      return null;
  }
}

/**
 * Bind the matchKey mapper to `window.keydown`. Ignores text inputs.
 */
export function useStudioShortcuts(
  ctx: ShortcutContext,
  dispatch: (action: ShortcutAction) => void,
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const action = matchKey(e, ctx);
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, dispatch]);
}

export function isTextFieldFocused(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
