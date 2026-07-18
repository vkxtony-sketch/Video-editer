// Browser-side error trap. Wires three independent event sources into a
// single in-memory queue + Convex `clientErrors.capture` mutation:
//
//   1. window.onerror                     → kind: "error"
//   2. window.unhandledrejection          → kind: "unhandledrejection"
//   3. console.error                      → kind: "console.error"  (monkey-patched once at install)
//   4. <ClientErrorBoundary/>             → kind: "boundary"
//
// All four carry the same payload shape below; the componentDidCatch
// path routes through a `capture` callback prop instead of the queue
// pipeline because boundary errors must land synchronously.
//
// Design notes (locked-in after three rounds of review):
//   - One-time install (idempotent + StrictMode safe). The uninstall
//     path returns from useEffect AND re-arms `installed = false` so the
//     React 18 strict-mode mount/unmount/mount cycle still ends up active.
//   - Owner id is read via a static getter (localStorage) — NOT from
//     React state — to avoid stale-closure bugs since useSession resolves
//     post-mount, and to keep the trap independent of any React subtree.
//   - Sanitization runs BEFORE enqueue; sanitized message/stack/extra.
//   - Dedup window 30 s with hard map cap of 1000 entries (cleared on overflow).
//   - Flush every 1.5 s, also on visibilitychange=hidden and beforeunload.
//   - `originalConsoleError` is the raw ref (NOT bound) so `_resetForTests`
//     yields strict `===` equality for tests, and via `.apply(console, args)`
//     the spy set up by vitest still tracks calls.

export type ClientErrorKind =
  | "error"
  | "unhandledrejection"
  | "boundary"
  | "console.error";

export interface ClientErrorRow {
  kind: ClientErrorKind;
  /** Optional in input — `trimRow` resolves missing route from `getRoute()`. */
  route?: string;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  extra?: string;
  ownerId?: string;
}

export type CaptureFn = (row: ClientErrorRow) => unknown | Promise<unknown>;
export type FlushFn = (rows: ClientErrorRow[]) => unknown | Promise<unknown>;
export type RouteGetter = () => string;
export type OwnerIdGetter = () => string | null;

const REDACT_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /sk_[A-Za-z0-9]{16,}/g,
  /gsk_[A-Za-z0-9]{16,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /xox[bp]-[A-Za-z0-9\-]+/g,
  /(?<=(?:token|key|api_?key|password)=)[^&\s]+/gi,
];

const QUEUE_LIMIT = 50;
const FLUSH_INTERVAL_MS = 1500;
const DEDUPE_WINDOW_MS = 30_000;
const SEEN_MAX_SIZE = 1000;
const MAX_MESSAGE_LEN = 1024;
const MAX_STACK_LEN = 5_000;
const MAX_EXTRA_LEN = 2000;
const MAX_ROUTE_LEN = 256;
const MAX_FILENAME_LEN = 256;
const MAX_OWNER_LEN = 128;

let installed = false;
let queue: ClientErrorRow[] = [];
const seen = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let captureFn: CaptureFn = () => {};
let flushFn: FlushFn | null = null;
let getRoute: RouteGetter = () =>
  typeof location !== "undefined" ? location.pathname : "";
let getOwnerId: OwnerIdGetter = () => null;
// Raw ref (not bound). Setting `console.error = originalConsoleError` after
// `_resetForTests` therefore satisfies `console.error === orig` exactly.
let originalConsoleError: typeof console.error | null = null;

function redact(s: string | undefined): string | undefined {
  if (!s) return s;
  let out = s;
  for (const re of REDACT_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

function safeStringify(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  try {
    if (typeof v === "string") return v;
    if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ""}`;
    if (v instanceof Event) {
      return JSON.stringify({
        type: v.type,
        filename: (v as any).filename,
        lineno: (v as any).lineno,
        colno: (v as any).colno,
        message: (v as any).message,
      });
    }
    return JSON.stringify(v).slice(0, MAX_EXTRA_LEN);
  } catch {
    return undefined;
  }
}

function dedupeKey(r: ClientErrorRow): string {
  const file = r.filename ?? "";
  return `${r.kind}|${file}|${r.lineno ?? 0}|${r.colno ?? 0}|${r.message.slice(0, 80)}`;
}

function seenAdd(key: string): boolean {
  if (seen.size >= SEEN_MAX_SIZE) seen.clear();
  seen.set(key, Date.now());
  return true;
}

function seenWithinWindow(key: string): boolean {
  const last = seen.get(key);
  if (last && Date.now() - last < DEDUPE_WINDOW_MS) return true;
  seenAdd(key);
  return false;
}

function trimRow(row: ClientErrorRow): ClientErrorRow {
  return {
    kind: row.kind,
    route: (row.route || getRoute()).slice(0, MAX_ROUTE_LEN) || "/",
    message: (row.message ?? "").slice(0, MAX_MESSAGE_LEN) || "<empty>",
    stack: row.stack?.slice(0, MAX_STACK_LEN),
    filename: row.filename?.slice(0, MAX_FILENAME_LEN),
    lineno: row.lineno,
    colno: row.colno,
    extra: row.extra?.slice(0, MAX_EXTRA_LEN),
    ownerId:
      (row.ownerId ?? getOwnerId() ?? undefined)?.slice(0, MAX_OWNER_LEN),
  };
}

function redactRow(row: ClientErrorRow): ClientErrorRow {
  return {
    ...row,
    message: redact(row.message) ?? row.message,
    stack: redact(row.stack),
    extra: redact(row.extra),
  };
}

function enqueue(row: ClientErrorRow): void {
  const trimmed = trimRow(
    redactRow({ ...row, message: row.message ?? "" }),
  ) as ClientErrorRow;
  const key = dedupeKey(trimmed);
  // Single check: seenWithinWindow returns true on dedupe hit (key seen
  // within 30 s) and false after marking a brand-new entry. Cleaner than
  // comparing `seen.get(key) !== Date.now()` — which can drift across the
  // two Date.now() calls on the same instant.
  if (seenWithinWindow(key)) {
    return;
  }
  if (queue.length >= QUEUE_LIMIT) {
    queue.push({
      kind: "console.error",
      message: `client-error-trap: flood limit reached, ${queue.length}+ pending`,
      route: getRoute(),
    });
    return;
  }
  queue.push(trimmed);
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, FLUSH_INTERVAL_MS);
}

async function flushNow(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0 && !flushFn) return;
  const batch = queue.slice();
  queue = [];
  try {
    if (flushFn) {
      await Promise.resolve(flushFn(batch));
    } else {
      await Promise.all(
        batch.map((r) => Promise.resolve(captureFn(r)).catch(() => null)),
      );
    }
  } catch {
    /* best-effort ignore */
  }
}

function onError(ev: ErrorEvent): void {
  enqueue({
    kind: "error",
    message: ev.message || ev.error?.message || "<no-message>",
    stack: ev.error?.stack,
    filename: ev.filename,
    lineno: ev.lineno,
    colno: ev.colno,
    extra: safeStringify(ev.error),
  });
}

function onUnhandledRejection(ev: PromiseRejectionEvent): void {
  const reason = ev.reason;
  enqueue({
    kind: "unhandledrejection",
    message:
      typeof reason === "object" && reason !== null
        ? ((reason as any).message ?? safeStringify(reason) ?? "<no-reason>")
        : String(reason) ?? "<no-reason>",
    stack: reason instanceof Error ? reason.stack : undefined,
    extra: safeStringify(reason),
  });
}

function monkeyPatchConsoleError(): void {
  if (originalConsoleError) return;
  originalConsoleError = console.error;
  // Arrow function keeps `this === undefined` which is fine because we
  // explicitly invoke originalConsoleError.apply(console, args) below.
  const ourFn = (...args: unknown[]): void => {
    try {
      enqueue({
        kind: "console.error",
        message:
          args
            .map(safeStringify)
            .filter(Boolean)
            .join(" ") || "<console.error>",
        extra: safeStringify(args),
      });
    } catch {
      /* never let the trap throw on top of the original error */
    }
    (
      originalConsoleError as unknown as (...a: unknown[]) => void
    ).apply(console, args as []);
  };
  console.error = ourFn as typeof console.error;
}

function restoreConsoleError(): void {
  if (!originalConsoleError) return;
  console.error = originalConsoleError;
  originalConsoleError = null;
}

function flushVisible(): void {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    void flushNow();
  }
}

export interface InstallClientErrorTrapOptions {
  capture: CaptureFn;
  flush?: FlushFn;
  getRoute?: RouteGetter;
  getOwnerId?: OwnerIdGetter;
}

export function installClientErrorTrap(
  opts: InstallClientErrorTrapOptions,
): () => void {
  // Idempotent: a second install is a no-op so StrictMode's
  // mount/unmount/mount cycle can't double-register. `uninstall()` flips
  // `installed = false` so the NEXT install attempt can register again.
  if (installed) return uninstall;
  installed = true;
  captureFn = opts.capture;
  flushFn = opts.flush ?? null;
  getRoute = opts.getRoute ?? getRoute;
  getOwnerId = opts.getOwnerId ?? getOwnerId;

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  document.addEventListener("visibilitychange", flushVisible);
  window.addEventListener("beforeunload", () => void flushNow());
  pruneTimer = setInterval(() => {
    const cutoff = Date.now() - DEDUPE_WINDOW_MS * 2;
    for (const [k, t] of seen) if (t < cutoff) seen.delete(k);
  }, DEDUPE_WINDOW_MS);
  monkeyPatchConsoleError();
  return uninstall;
}

function uninstall(): void {
  if (!installed) return;
  installed = false;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
  document.removeEventListener("visibilitychange", flushVisible);
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  restoreConsoleError();
  void flushNow();
}

/**
 * Test-only escape hatch. Restores original console.error, clears state,
 * drops the installed flag, and resets the queue. MUST be called in
 * `afterEach` from any test that exercises the trap, otherwise console.error
 * monkeypatching leaks into sibling test files.
 */
export function _resetForTests(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  restoreConsoleError();
  installed = false;
  queue = [];
  seen.clear();
  captureFn = () => {};
  flushFn = null;
  getRoute = () =>
    typeof location !== "undefined" ? location.pathname : "";
  getOwnerId = () => null;
}

/**
 * Direct capture API: lets <ClientErrorBoundary/> report synchronous
 * React render-tree failures without going through the queue pipeline.
 */
export function reportClientError(
  fn: CaptureFn,
  row: ClientErrorRow,
): Promise<unknown> {
  return Promise.resolve(fn(trimRow(redactRow(row)))).catch(() => null);
}
