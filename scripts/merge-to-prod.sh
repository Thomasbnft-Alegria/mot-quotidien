#!/bin/bash
# Merge dev → main après QA validé.
# Ne jamais appeler sans avoir lancé qa-check.sh d'abord.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "🚀 MERGE dev → main"

# Vérifier qu'on est bien sur dev
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "dev" ]; then
  echo "❌ Pas sur la branche dev (branche actuelle: $CURRENT)"
  exit 1
fi

# Push dev d'abord
git push origin dev

# Basculer sur main, merger, push
git checkout main
git merge dev --no-ff -m "merge: dev → main (QA passed)"
git push origin main

# Revenir sur dev
git checkout dev

echo "✅ Déployé sur main — GitHub Actions va builder et déployer sur GitHub Pages."
