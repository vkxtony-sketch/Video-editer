import { useEffect } from "react";
import { useMutation } from "convex/react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Studio from "./pages/Studio";
import AppLayout from "./components/layout/AppLayout";
import { ClientErrorBoundary } from "./components/ClientErrorBoundary";
import { installClientErrorTrap } from "./lib/clientErrorTrap";
import { api } from "../convex/_generated/api";

export default function App() {
  const captureClientError = useMutation(api.clientErrors.capture);

  // Install once. The trap module is idempotent + StrictMode-safe (it
  // flips `installed = false` on uninstall so the next mount can
  // re-register). The owner id comes from localStorage, not React state,
  // so the static getter stays stable across re-renders.
  useEffect(() => {
    return installClientErrorTrap({
      capture: (row) => captureClientError(row),
      getOwnerId: () => {
        try {
          return window.localStorage.getItem("neon:session");
        } catch {
          return null;
        }
      },
    });
  }, [captureClientError]);

  return (
    <ClientErrorBoundary capture={(row) => captureClientError(row)}>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/studio/:id" element={<Studio />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </ClientErrorBoundary>
  );
}
