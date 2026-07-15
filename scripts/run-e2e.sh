#!/usr/bin/env bash
# Wrapper for `bun test:e2e`. Honors SKIP_E2E to bypass browser install when
# the environment cannot download Chromium (e.g. sandboxed CI without network).
set -u

if [ "${SKIP_E2E:-0}" = "1" ]; then
  echo "[test:e2e] SKIP_E2E=1 — e2e tests skipped."
  exit 0
fi

# Ensure Chromium is installed before running.
if [ ! -d "$HOME/.cache/ms-playwright" ] || ! ls "$HOME/.cache/ms-playwright"/*chromium* >/dev/null 2>&1; then
  echo "[test:e2e] Installing Chromium for Playwright…"
  if ! bunx playwright install chromium; then
    echo "[test:e2e] Chromium install failed. Re-run with SKIP_E2E=1 to bypass." >&2
    exit 1
  fi
fi

exec bunx playwright test "$@"
