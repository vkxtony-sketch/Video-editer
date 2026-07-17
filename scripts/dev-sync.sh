#!/usr/bin/env bash
# dev-sync.sh - run after a meaningful edit set to ship work to origin/main.
# Usage: bun scripts/dev-sync.sh       (or run pieces separately)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
echo '+ bun tsc -b --noEmit (typecheck)'
bun tsc -b --noEmit
echo '+ bun run test (full Vitest suite)'
bun run test
echo '+ git push via SSH plumbing'
git -c core.sshCommand='ssh -i /home/daytona/.ssh/id_ed25519 -o BatchMode=yes -o IdentitiesOnly=yes' push origin main
echo 'Sync complete.'
