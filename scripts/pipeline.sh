#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/lib/step-utils.sh"

SHARDS=2
SHARDED=false
IMAGE="playwright-coverage"
PW_DIR="sandbox/playwright"

MOUNTS=(
  blob-report
  snapshots
  playwright-report
  test-results
  playwright-coverage
)

for arg in "$@"; do
  case "$arg" in
    --sharded) SHARDED=true ;;
  esac
done

docker_run() {
  local mount_flags=""
  for dir in "${MOUNTS[@]}"; do
    mount_flags+=" -v ./${PW_DIR}/${dir}:/app/${PW_DIR}/${dir}"
  done
  docker run --rm -e FORCE_COLOR=1 --ipc=host --init $mount_flags "$IMAGE" \
    bash -c "$1"
}

step_begin "Cleaning up"
yarn clean
step_end

step_begin "Installing dependencies"
yarn install --immutable
step_end

step_begin "Building all packages"
yarn workspaces foreach --all --topological run build
step_end

step_begin "Running unit tests"
yarn workspaces foreach --all --exclude '@sandbox/playwright' run test
step_end

if [ "$SHARDED" = true ]; then
  step_begin "Building Docker image"
  docker buildx build -t "$IMAGE" -f sandbox/playwright/Dockerfile --load .
  step_end

  for i in $(seq 1 "$SHARDS"); do
    step_begin "Running Playwright shard ${i}/${SHARDS} (Docker)"
    docker_run "CI=1 yarn playwright test --shard=${i}/${SHARDS} --update-snapshots"
    step_end
  done

  step_begin "Merging Playwright blob reports (Docker)"
  docker_run "CI=1 yarn playwright merge-reports"
  step_end
else
  step_begin "Running Playwright tests"
  yarn workspace @sandbox/playwright test --update-snapshots
  step_end
fi

step_begin "Creating fake stale snapshots"
SNAP_DIR="${PW_DIR}/snapshots"
find "$SNAP_DIR" -name '*.png' | while read -r f; do
  cp "$f" "${f%.png}-stale.png"
done
step_end

step_begin "Verifying stale snapshot detection exits non-zero"
if tsx packages/integrations/playwright-snapshots/src/cli.ts --dir "$PW_DIR"; then
  echo "ERROR: stale-snapshots should have exited non-zero but didn't" >&2
  exit 1
fi
echo "  correctly detected stale snapshots"
step_end

step_begin "Deleting stale snapshots"
tsx packages/integrations/playwright-snapshots/src/cli.ts --dir "$PW_DIR" --delete
step_end

step_begin "Verifying no stale snapshots remain"
tsx packages/integrations/playwright-snapshots/src/cli.ts --dir "$PW_DIR"
step_end

step_begin "Generating test-fusion report"
CI=1 yarn generate-report
step_end
