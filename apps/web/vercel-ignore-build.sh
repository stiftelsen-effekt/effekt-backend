#!/usr/bin/env bash
# "Ignored Build Step" of the three website projects on Vercel (main-site, giv-effektivt,
# ge-effektivt), run in apps/web as `bash vercel-ignore-build.sh`. Exit 1 builds, exit 0 skips.
# Anything unexpected builds.
#
# Production always builds: the Sanity deploy hooks and the daily scheduler rebuild main's
# current commit to publish new content, and nothing tells such a deployment apart from a push.
#
# Previews build when the website or what it is built from changed: since the branch's last
# deployment, or for a branch's first deployment, since it left main.
set -u

[ "${VERCEL_ENV:-}" = production ] && exit 1

# apps/web plus the tRPC contract it compiles in (packages/api re-exports
# apps/api/src/trpc/shared, the type build reads the rest) and the workspace setup.
WATCH=(
  .
  ../../packages/api
  ../../packages/config
  ../../apps/api/src/trpc
  ../../apps/api/scripts/build-types.mjs
  ../../apps/api/tsconfig.json
  ../../apps/api/tsconfig.trpc.json
  ../../apps/api/package.json
  ../../package.json
  ../../pnpm-lock.yaml
  ../../pnpm-workspace.yaml
  ../../.nvmrc
)

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$base" ]; then
  # Vercel's clone is shallow: fetch enough of main and of this branch to find where they split.
  repo="https://github.com/${VERCEL_GIT_REPO_OWNER:-stiftelsen-effekt}/${VERCEL_GIT_REPO_SLUG:-effekt-platform}.git"
  git fetch --quiet --depth=200 "$repo" main || exit 1
  main=$(git rev-parse FETCH_HEAD) || exit 1
  git fetch --quiet --depth=200 "$repo" "${VERCEL_GIT_COMMIT_SHA:-HEAD}" 2>/dev/null || true
  base=$(git merge-base HEAD "$main") || exit 1
fi

git cat-file -e "${base}^{commit}" 2>/dev/null || exit 1
if git diff --quiet "$base" HEAD -- "${WATCH[@]}"; then
  echo "No website changes since ${base}: skipping this preview."
  exit 0
fi
echo "Website changes since ${base}: building."
exit 1
