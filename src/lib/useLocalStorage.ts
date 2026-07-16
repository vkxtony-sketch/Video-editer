// Project-scoped Studio preferences. Stores the user's last selected tab and
// active highlight per projectId so a reload or page refresh keeps them
// where they were. Listens to `storage` events for cross-tab sync.

import { useCallback, useEffect, useState } from "react";

export const STORAGE_PREFIX = "neon:studio:v1:";

export function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

export type StudioTab = "titles" | "thumbs" | "captions";

/**
 * libx264 `-preset` choice surfaced in the Studio header via the
 * dropdown next to Export. Higher presets (medium) → smaller files,
 * slower browser-side encodes. Defaults to "ultrafast" because that
 * finishes a 30 s highlight reel of a <2 h source in roughly half the
 * time of "medium" on a typical laptop browser.
 */
export type RenderPreset = "ultrafast" | "superfast" | "veryfast" | "medium";

const RENDER_PRESETS: RenderPreset[] = [
  "ultrafast",
  "superfast",
  "veryfast",
  "medium",
];

export type StudioPrefs = {
  tab: StudioTab;
  highlightId: string | null;
  preset: RenderPreset;
  updatedAt: number;
};

export const DEFAULT_PREFS: StudioPrefs = {
  tab: "titles",
  highlightId: null,
  preset: "ultrafast",
  updatedAt: 0,
};

export function readPrefs(projectId: string): StudioPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.tab === "titles" ||
        parsed.tab === "thumbs" ||
        parsed.tab === "captions")
    ) {
    return {
      tab: parsed.tab,
      highlightId:
        typeof parsed.highlightId === "string" ? parsed.highlightId : null,
      preset: RENDER_PRESETS.includes(parsed.preset)
        ? (parsed.preset as RenderPreset)
        : "ultrafast",
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
    }
  } catch {
    /* corrupt JSON → fall back to default */
  }
  return DEFAULT_PREFS;
}

export function writePrefs(projectId: string, prefs: StudioPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(prefs));
  } catch {
    /* quota exceeded / private mode → swallow */
  }
}

export function useStudioPrefs(
  projectId: string,
): [StudioPrefs, (patch: Partial<StudioPrefs>) => void] {
  const [prefs, setPrefs] = useState<StudioPrefs>(() => readPrefs(projectId));

  useEffect(() => {
    setPrefs(readPrefs(projectId));
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey(projectId)) return;
      setPrefs(readPrefs(projectId));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [projectId]);

  const update = useCallback(
    (patch: Partial<StudioPrefs>) => {
      setPrefs((prev) => {
        const next: StudioPrefs = {
          ...prev,
          ...patch,
          updatedAt: Date.now(),
        };
        writePrefs(projectId, next);
        return next;
      });
    },
    [projectId],
  );

  return [prefs, update];
}
