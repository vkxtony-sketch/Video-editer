import { useEffect, useState } from "react";

const KEY = "neon:session";
function makeId(): string {
  return (
    "u_" +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-4)
  );
}

/**
 * Returns a stable per-device session id stored in localStorage. There's no
 * real auth in this MVP; this just lets the dashboard list "your" projects
 * across reloads on the same browser.
 */
export function useSession(): string {
  const [id, setId] = useState<string>("");
  useEffect(() => {
    try {
      const existing = window.localStorage.getItem(KEY);
      if (existing) {
        setId(existing);
        return;
      }
    } catch (_) {
      /* ignore */
    }
    const next = makeId();
    try {
      window.localStorage.setItem(KEY, next);
    } catch (_) {
      /* ignore */
    }
    setId(next);
  }, []);
  return id;
}
