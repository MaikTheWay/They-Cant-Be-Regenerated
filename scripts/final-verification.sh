#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/docs/final-verification.log"
: > "$LOG"
run_step() {
  local label="$1"
  shift
  local command_name="$1"
  shift
  printf '\n[%s]\n$ %q' "$label" "$command_name" >> "$LOG"
  printf ' %q' "$@" >> "$LOG"
  printf '\n' >> "$LOG"
  "$command_name" "$@" >> "$LOG" 2>&1
  local status=$?
  printf '[%s] exit=%s\n' "$label" "$status" >> "$LOG"
  return "$status"
}

status=0
run_step "pnpm install" pnpm install --no-frozen-lockfile || status=1
run_step "tsc" pnpm exec tsc -b --pretty false || status=1
run_step "vitest" pnpm test -- --run || status=1
run_step "vite build" pnpm run build || status=1
run_step "asset audit" python3 scripts/audit-cardconjurer-assets.py || status=1
if command -v cargo >/dev/null 2>&1; then
  run_step "cargo check" cargo check --manifest-path src-tauri/Cargo.toml || status=1
else
  printf '\n[cargo check] SKIPPED: cargo is not installed in this environment\n' >> "$LOG"
fi
printf '\nFINAL_STATUS=%s\n' "$status" >> "$LOG"
cat "$LOG"
exit "$status"
