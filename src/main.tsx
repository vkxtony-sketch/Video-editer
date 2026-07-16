import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";

// Defensive fallback so the Convex client constructor never throws when
// VITE_CONVEX_URL is empty/missing at build time on a fresh clone or a
// preview sandbox. The placeholder URL is unreachable on purpose — it just
// guarantees the JS module loads so React can mount the dark hero.
const convexUrl =
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() ||
  "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

// Top-level error boundary. Without this, ANY uncaught throw during render
// (Convex init failure, missing module, etc.) leaves the Freebuff iframe
// blank-white because React unmounts the tree silently. With this, the user
// always sees a styled dark fallback with the actual error message.
class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[Neon AI Lab] render error:", error, info);
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error?.message ?? String(this.state.error ?? "unknown");
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#0b0f1a",
            color: "#e8eaf3",
            padding: 24,
            fontFamily:
              "system-ui, -apple-system, 'Segoe UI', 'Inter', sans-serif",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#22d3ee",
                marginBottom: 12,
              }}
            >
              Neon AI Lab · render error
            </div>
            <h1 style={{ fontSize: 28, margin: "0 0 12px", lineHeight: 1.2 }}>
              The UI caught an error and kept the page styled.
            </h1>
            <p
              style={{
                opacity: 0.7,
                lineHeight: 1.5,
                fontSize: 14,
                margin: "0 0 16px",
              }}
            >
              The static shell still loaded. This message appears whenever
              Convex (or any provider) fails to mount. Try refreshing the
              preview tab — if it persists, the bundled
              <code style={{ margin: "0 4px" }}>.env</code>
              needs a valid <code>VITE_CONVEX_URL</code>.
            </p>
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: "#11182f",
                border: "1px solid #1f2a48",
                borderRadius: 8,
                fontSize: 12,
                color: "#ff8b8b",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <ConvexProvider client={convex}>
        <BrowserRouter>
          <App />
          <Toaster
            richColors
            closeButton
            position="top-right"
            theme="dark"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-card/95 !border !border-border/80 !text-foreground !backdrop-blur",
                description: "!text-muted-foreground",
              },
            }}
          />
        </BrowserRouter>
      </ConvexProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>,
);
