#!/bin/sh
# Stands in for `pnpm` in the e2e stack's backend containers when they run from the runner's
# install (compose.e2e-ci.yml): their commands only use `pnpm exec <bin> ...`. Real pnpm there
# checks the mounted node_modules against its own state and reinstalls the whole workspace.
if [ "$1" != exec ]; then
  echo "pnpm $1: only \`pnpm exec\` is available in this container" >&2
  exit 1
fi
shift
PATH="$PWD/node_modules/.bin:/app/node_modules/.bin:$PATH" exec "$@"
