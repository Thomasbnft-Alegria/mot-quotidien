#!/bin/bash
# QA Check Script — mot-quotidien
# Runs all checks before merging to main.
# Exit code 0 = all pass, non-zero = failure.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "🔍 QA CHECK — mot-quotidien"
echo "================================"

# 1. Lint
echo ""
echo "→ [1/3] ESLint..."
if npm run lint 2>&1; then
  echo "✅ Lint OK"
else
  echo "❌ Lint FAILED"
  exit 1
fi

# 2. TypeScript + build
echo ""
echo "→ [2/3] TypeScript build (vite)..."
if npm run build 2>&1; then
  echo "✅ Build OK"
else
  echo "❌ Build FAILED"
  exit 2
fi

# 3. Unit tests
echo ""
echo "→ [3/3] Vitest..."
if npm test 2>&1; then
  echo "✅ Tests OK"
else
  echo "❌ Tests FAILED"
  exit 3
fi

echo ""
echo "================================"
echo "✅ ALL CHECKS PASSED — ready to merge"
