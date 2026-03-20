#!/usr/bin/env bash
set -euo pipefail

PACKAGES=(
  packages/core
  packages/integrations/playwright-coverage
  packages/integrations/playwright-stale-snapshots
)

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
  esac
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

VERSION=$(node -p "require('./packages/core/package.json').version")

echo "Publishing v${VERSION}"
echo ""

if [[ "$DRY_RUN" = true ]]; then
  echo "(dry run — nothing will be published)"
  echo ""
fi

for pkg in "${PACKAGES[@]}"; do
  NAME=$(node -p "require('./${pkg}/package.json').name")
  echo "  ${NAME}@${VERSION}"

  if [[ "$DRY_RUN" = true ]]; then
    yarn workspace "$NAME" npm publish --dry-run
  else
    yarn workspace "$NAME" npm publish
  fi

  echo ""
done

if [[ "$DRY_RUN" = false ]]; then
  echo "Done. Published v${VERSION}."
fi
