#!/usr/bin/env bash
set -euo pipefail

PACKAGES=(
  packages/core/package.json
  packages/integrations/playwright-coverage/package.json
  packages/integrations/playwright-stale-snapshots/package.json
)

usage() {
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
}

[[ $# -ne 1 ]] && usage

BUMP="$1"
CURRENT=$(node -p "require('./packages/core/package.json').version")

case "$BUMP" in
  patch|minor|major)
    NEW_VERSION=$(node -p "
      const [ma,mi,pa] = '${CURRENT}'.split('.').map(Number);
      ({ patch: [ma,mi,pa+1], minor: [ma,mi+1,0], major: [ma+1,0,0] })['${BUMP}'].join('.')
    ")
    ;;
  [0-9]*.[0-9]*.[0-9]*)
    NEW_VERSION="$BUMP"
    ;;
  *)
    usage
    ;;
esac

echo "Bumping version: ${CURRENT} → ${NEW_VERSION}"
echo ""

for pkg in "${PACKAGES[@]}"; do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('${pkg}', 'utf8'));
    pkg.version = '${NEW_VERSION}';
    fs.writeFileSync('${pkg}', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  updated ${pkg}"
done

echo ""
echo "Bumped to v${NEW_VERSION}"
echo "Run 'git add -A && git commit -m \"v${NEW_VERSION}\" && git tag \"v${NEW_VERSION}\"' when ready."
