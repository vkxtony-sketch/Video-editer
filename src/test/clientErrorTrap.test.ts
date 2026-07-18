import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installClientErrorTrap,
  _resetForTests,
  type ClientErrorRow,
} from "../lib/clientErrorTrap";

/**
 * Helpers: install + capture collector. Always pairs install with
 * _resetForTests in afterEach so console.error monkeypatching does NOT
 * leak into sibling test files.
 */
function makeCaptures() {
  const rows: ClientErrorRow[] = [];
  const cap = (row: ClientErrorRow) => {
    rows.push(row);
  };
  return { rows, cap };
}

describe("installClientErrorTrap", () => {
  let originalErrorFn: ((...args: unknown[]) => void) | null;

  beforeEach(() => {
    _resetForTests();
    originalErrorFn = window.onerror;
  });
  afterEach(() => {
    _resetForTests();
    window.onerror = originalErrorFn;
  });

  it("captures window 'error' events with a sanitized payload", () => {
    vi.useFakeTimers();
    const { rows, cap } = makeCaptures();
    const uninstall = installClientErrorTrap({ capture: cap });

    const err = new Error(
      "boom — gsk_AbCdEfGhIjKlMnOpQrSt1234567890 inside",
    );
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: err.message,
        filename: "test.js",
        lineno: 12,
        colno: 4,
        error: err,
      }),
    );
    // Drain the 1.5s flush timer; captureFn is invoked synchronously
    // once the flush fires.
    vi.runAllTimers();

    expect(rows.length).toBeGreaterThan(0);
    const last = rows[rows.length - 1];
    expect(last.kind).toBe("error");
    expect(last.filename).toBe("test.js");
    expect(last.lineno).toBe(12);
    expect(last.colno).toBe(4);
    // Redaction: any gsk_ token replaced with [REDACTED].
    expect(last.message).not.toMatch(/gsk_/);
    expect(last.message).toMatch(/REDACTED/);

    uninstall();
    vi.useRealTimers();
  });

  it("captures unhandledrejection events", () => {
    vi.useFakeTimers();
    const { rows, cap } = makeCaptures();
    const uninstall = installClientErrorTrap({ capture: cap });

    const ev = new Event("unhandledrejection") as any;
    ev.reason = new Error("async boom");
    window.dispatchEvent(ev);
    vi.runAllTimers();

    expect(rows.some((r) => r.kind === "unhandledrejection")).toBe(true);
    const r = rows.find((r) => r.kind === "unhandledrejection");
    expect(r?.message).toMatch(/async boom/);

    uninstall();
    vi.useRealTimers();
  });

  it("dedupes identical errors within the 30s window", () => {
    vi.useFakeTimers();
    const { rows, cap } = makeCaptures();
    const uninstall = installClientErrorTrap({ capture: cap });

    const payload = {
      message: "dupe",
      filename: "f.js",
      lineno: 1,
      colno: 1,
      error: new Error("dupe"),
    };
    window.dispatchEvent(new ErrorEvent("error", payload));
    window.dispatchEvent(new ErrorEvent("error", payload));
    vi.runAllTimers();

    const errRows = rows.filter((r) => r.kind === "error");
    expect(errRows.length).toBe(1);

    uninstall();
    vi.useRealTimers();
  });

  it("redacts Bearer, sk_, gsk_, and URL ?token= in message + stack + extra", () => {
    vi.useFakeTimers();
    const { rows, cap } = makeCaptures();
    const uninstall = installClientErrorTrap({ capture: cap });

    const err = new Error(
      "Bearer abc.def_ghi — also gsk_PROJECTTESTKEY1234567890ABCDEFGH and ?token=sk_SECRETSECRETSECRETSECRET",
    );
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: err.message,
        filename: "x.js",
        lineno: 1,
        colno: 1,
        error: err,
      }),
    );
    vi.runAllTimers();

    expect(rows.length).toBeGreaterThan(0);
    const last = rows[rows.length - 1];
    expect(last.message).not.toMatch(/Bearer\s+abc\.def_ghi/i);
    expect(last.message).toMatch(/REDACTED/);
    expect(last.message).not.toMatch(/gsk_/);
    expect((last.stack ?? "")).not.toMatch(/gsk_PROJECTTEST/);
    expect((last.stack ?? "")).toMatch(/REDACTED/);
    expect(last.message).not.toMatch(/\?token=sk_/);

    uninstall();
    vi.useRealTimers();
  });

  it("monkeypatches console.error: captures AND invokes the original impl", () => {
    vi.useFakeTimers();
    const { rows, cap } = makeCaptures();
    const origBefore = console.error;
    const spy = vi.spyOn(console, "error");

    const uninstall = installClientErrorTrap({ capture: cap });
    console.error("sample boom — gsk_SAMPLEABCDEFGHIJK123456");
    vi.runAllTimers();

    // Original console.error was called.
    expect(spy).toHaveBeenCalled();
    // The trap enqueued a console.error-kind row.
    expect(rows.some((r) => r.kind === "console.error")).toBe(true);

    uninstall();
    spy.mockRestore();
    expect(console.error).toBe(origBefore);
    vi.useRealTimers();
  });

  it("is idempotent — a second install is a no-op", () => {
    vi.useFakeTimers();
    const cap1 = vi.fn();
    const cap2 = vi.fn();

    installClientErrorTrap({ capture: cap1 });
    installClientErrorTrap({ capture: cap2 });

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "idemp",
        filename: "i.js",
        lineno: 1,
        colno: 0,
      }),
    );
    vi.runAllTimers();

    expect(cap1).toHaveBeenCalled();
    expect(cap2).not.toHaveBeenCalled();
    _resetForTests();
    vi.useRealTimers();
  });

  it("_resetForTests restores console.error", () => {
    const orig = console.error;
    installClientErrorTrap({ capture: () => {} });
    expect(console.error).not.toBe(orig);
    _resetForTests();
    // After reset, console.error must be the unchanged original reference.
    expect(console.error).toBe(orig);
  });
});
