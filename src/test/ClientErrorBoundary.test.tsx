import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ClientErrorBoundary,
  type ClientErrorCaptureInput,
} from "../components/ClientErrorBoundary";

function Boom({ when = true }: { when?: boolean }) {
  if (when) throw new Error("boundary-test boom");
  return null;
}

describe("ClientErrorBoundary", () => {
  // React logs the caught error to console.error from inside its
  // reconciler. Suppress during boundary tests so vitest doesn't flag it.
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it("catches render-tree errors and reports them via the capture prop", () => {
    let captured: ClientErrorCaptureInput | null = null;
    const capture = (row: ClientErrorCaptureInput) => {
      captured = row;
    };

    render(
      <ClientErrorBoundary capture={capture}>
        <Boom />
      </ClientErrorBoundary>,
    );

    expect(
      screen.getByTestId("client-error-fallback"),
    ).toBeInTheDocument();
    expect(captured).not.toBeNull();
    expect(captured!.kind).toBe("boundary");
    expect(captured!.message).toBe("boundary-test boom");
    expect(typeof captured!.stack).toBe("string");
    expect(typeof captured!.route).toBe("string");
  });

  it("does not render the fallback UI when no error is thrown", () => {
    const capture = vi.fn();
    render(
      <ClientErrorBoundary capture={capture}>
        <Boom when={false} />
      </ClientErrorBoundary>,
    );
    expect(screen.queryByTestId("client-error-fallback")).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not crash the fallback UI when the capture prop throws", () => {
    const capture = () => {
      throw new Error("Convex is down");
    };
    expect(() =>
      render(
        <ClientErrorBoundary capture={capture}>
          <Boom />
        </ClientErrorBoundary>,
      ),
    ).not.toThrow();
    expect(
      screen.getByTestId("client-error-fallback"),
    ).toBeInTheDocument();
  });
});
