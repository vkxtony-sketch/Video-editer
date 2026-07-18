// React error boundary. Captures synchronous render-tree failures and
// reports them via the `capture` callback prop (typically a
// `useMutation(api.clientErrors.capture)` call). The window listeners in
// `clientErrorTrap.ts` cover async + non-React errors; this one covers
// the React render tree.
//
// `capture` is invoked inside a try/catch — if Convex is down or the
// capture itself throws, the fallback UI must still render. Worst case
// we surface the error inline and let the user reset.

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { ClientErrorKind } from "../lib/clientErrorTrap";

export interface ClientErrorCaptureInput {
  kind: ClientErrorKind;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  extra?: string;
  route: string;
}

export type ClientErrorCaptureFn = (
  row: ClientErrorCaptureInput,
) => void | Promise<void>;

interface Props {
  capture: ClientErrorCaptureFn;
  fallback?: (err: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  err: Error | null;
}

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    // Thinker fix #4: never let the capture itself break the boundary.
    try {
      const route =
        typeof location !== "undefined" ? location.pathname : "";
      void Promise.resolve(
        this.props.capture({
          kind: "boundary",
          message: (err?.message ?? "<boundary>").slice(0, 1024),
          stack: err?.stack?.slice(0, 5000),
          route,
          extra: info.componentStack?.slice(0, 2000),
        }),
      ).catch(() => undefined);
    } catch {
      /* swallow */
    }
  }

  reset = (): void => {
    this.setState({ err: null });
  };

  override render(): ReactNode {
    const { err } = this.state;
    if (err && this.props.fallback) return this.props.fallback(err, this.reset);
    if (err) {
      return (
        <div
          role="alert"
          className="mx-auto max-w-2xl px-5 py-16 text-center"
          data-testid="client-error-fallback"
        >
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8">
            <h2 className="text-xl font-semibold text-destructive">
              Something broke in the app shell.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The dashboard caught the error and reported it. You can
              reset the view below; refreshing the page also works.
            </p>
            <p className="mt-3 text-xs font-mono text-muted-foreground/80 line-clamp-3">
              {err.message}
            </p>
            <button
              onClick={this.reset}
              className="mt-5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Reset view
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
