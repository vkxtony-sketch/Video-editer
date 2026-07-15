import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// ESM-safe helper: this project has `"type": "module"` in package.json, so
// `__dirname` is not defined inside this module.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Standalone vitest config — kept separate from vite.config.ts so we don't
// disturb Freebuff's HMR-disabled dev server settings.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": r("./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/components/ui/**"],
    },
  },
});
