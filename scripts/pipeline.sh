#!/usr/bin/env bash
# End-to-end pipeline exercised by `yarn test`.
#
# Runs all three examples (Vite, Jest, and the single-package repo) through unit
# tests, an instrumented build, Playwright E2E, the playwright-stale-snapshots
# integration checks, and coverage fusion. Every example carries the full
# visual-snapshot + Docker-sharding setup.
#
# Flags:
#   --sharded         Run each example's Playwright suite across shards in Docker.
#                     Without it, everything runs locally.
#   --verbose         Stream step output instead of the compact spinner UI.
#   --only <name>     Run a single example only (vite-mono | jest-mono | vite-single).
#                     Combine with --sharded to shard just that one.
set -euo pipefail

source "$(dirname "$0")/lib/step-utils.sh"

PIPELINE_START=$(date +%s)
SHARDS=2
SHARDED=false
ONLY=""
IMAGE="test-fusion-example"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_MODULES_VOLUME="test-fusion-linux-node_modules"
VALID_EXAMPLES=(vite-mono jest-mono vite-single)

while [ $# -gt 0 ]; do
  case "$1" in
    --sharded) SHARDED=true ;;
    --verbose) VERBOSE=true ;;
    --only) shift; ONLY="${1:-}" ;;
    --only=*) ONLY="${1#*=}" ;;
  esac
  shift
done

if [ -n "$ONLY" ]; then
  found=false
  for e in "${VALID_EXAMPLES[@]}"; do
    [ "$e" = "$ONLY" ] && found=true
  done
  if [ "$found" = false ]; then
    echo "Unknown --only value: '${ONLY}' (expected one of: ${VALID_EXAMPLES[*]})" >&2
    exit 1
  fi
fi

# True when an example should run (no --only filter, or it matches).
should_run() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

# Sharded Playwright runs in Docker, where the app's istanbul-baked host paths
# don't match the container cwd. This flag turns on the example configs'
# transformPath so those keys are normalized back to relative and fuse correctly.
if [ "$SHARDED" = true ]; then
  export PLAYWRIGHT_SHARDED=1
fi

docker_run() {
  docker run --rm -e FORCE_COLOR=1 -e CI=1 -e PLAYWRIGHT_SHARDED --ipc=host --init \
    -v "${REPO_ROOT}:/app" \
    -v "${NODE_MODULES_VOLUME}:/app/node_modules" \
    -w /app \
    "$IMAGE" \
    bash -c "$1"
}

# Run the playwright-stale-snapshots lifecycle against one example's Playwright
# directory: seed fake stale files, detect, ignore, delete, then verify clean.
verify_stale_snapshots() {
  local pw_dir="$1"
  local cli="packages/integrations/playwright-stale-snapshots/src/cli.ts"

  find "${pw_dir}/snapshots" -name '*.png' | while read -r f; do
    cp "$f" "${f%.png}-stale.png"
  done

  if yarn tsx "$cli" --dir "$pw_dir"; then
    echo "ERROR: stale-snapshots should have exited non-zero but didn't" >&2
    exit 1
  fi
  echo "  correctly detected stale snapshots"

  yarn tsx "$cli" --dir "$pw_dir" --ignore "*-stale.png" "custom-snapshot-name.png"
  CI= yarn tsx "$cli" --dir "$pw_dir" --delete --ignore "custom-snapshot-name.png"
  yarn tsx "$cli" --dir "$pw_dir" --ignore "custom-snapshot-name.png"
}

# E2E + stale-snapshot checks + fusion for one example.
#   $1 label   $2 playwright workspace   $3 playwright script   $4 stale dir   $5 report script
run_e2e_stale_fuse() {
  local label="$1" scope="$2" script="$3" stale_dir="$4" report="$5"

  if [ "$SHARDED" = true ]; then
    for i in $(seq 1 "$SHARDS"); do
      step_begin "Playwright shard ${i}/${SHARDS} — ${label} example (Docker)"
      # Each shard runs in its own container but shares the bind-mounted repo, so
      # give every shard its own blob output dir. Otherwise the blob reporter wipes
      # blob-report/ at the start of each run and later shards clobber earlier ones
      # (real CI avoids this by running shards on separate machines).
      docker_run "PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-report/shard-${i} yarn workspace ${scope} ${script} --shard=${i}/${SHARDS} --update-snapshots"
      step_end
    done

    step_begin "Merging blob reports — ${label} example (Docker)"
    # Collect every shard's blob into blob-report/ (merge-reports only reads the
    # top level), then merge them into a single report.
    docker_run "mv ${stale_dir}/blob-report/shard-*/*.zip ${stale_dir}/blob-report/ && yarn workspace ${scope} merge-reports"
    step_end
  else
    step_begin "Running Playwright E2E (${label} example)"
    yarn workspace "${scope}" "${script}" --update-snapshots
    step_end
  fi

  step_begin "Verifying stale-snapshot lifecycle (${label} example)"
  verify_stale_snapshots "${stale_dir}"
  step_end

  step_begin "Fusing reports (${label} example)"
  CI=1 yarn "${report}"
  step_end
}

step_begin "Cleaning up"
yarn clean
step_end

step_begin "Installing dependencies"
yarn install --immutable
step_end

step_begin "Building publishable packages"
yarn workspaces foreach --all --topological --include '@test-fusion/*' run build
step_end

for ex in vite-mono jest-mono; do
  should_run "$ex" || continue
  step_begin "Running unit tests (${ex} example)"
  yarn workspace "@ex-${ex}/ui" test
  yarn workspace "@ex-${ex}/app" test
  step_end

  step_begin "Building instrumented app (${ex} example)"
  yarn workspace "@ex-${ex}/app" build
  step_end
done

if should_run vite-single; then
  step_begin "Running unit tests (vite-single example)"
  yarn workspace @ex-vite-single/app test
  step_end

  step_begin "Building instrumented app (vite-single example)"
  yarn workspace @ex-vite-single/app build
  step_end
fi

if [ "$SHARDED" = true ]; then
  step_begin "Building Docker image"
  docker buildx build -t "$IMAGE" -f "examples/vite-mono/playwright/Dockerfile" --load .
  step_end

  step_begin "Installing Linux dependencies (Docker)"
  docker_run "yarn install --immutable"
  step_end
fi

for ex in vite-mono jest-mono; do
  should_run "$ex" || continue
  run_e2e_stale_fuse "$ex" "@ex-${ex}/playwright" "test" "examples/${ex}/playwright" "report:${ex}"
done

if should_run vite-single; then
  run_e2e_stale_fuse "vite-single" "@ex-vite-single/app" "test:e2e" "examples/vite-single" "report:vite-single"
fi

echo -e "\n${GREEN}✓ Pipeline complete${NC} — total $(format_duration $(( $(date +%s) - PIPELINE_START )))"
