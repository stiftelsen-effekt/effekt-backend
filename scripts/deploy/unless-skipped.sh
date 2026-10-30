#!/usr/bin/env bash
# Runs a Cloud Build step's command unless guard.sh decided to skip the deploy. Usage, with
# `entrypoint: bash`: args: ["scripts/deploy/unless-skipped.sh", "gcloud", "run", "deploy", ...]
set -euo pipefail

skip_file="${DEPLOY_SKIP_FILE:-/workspace/.deploy-skip}"

if [[ -f "$skip_file" ]]; then
  echo "Skipped: $(cat "$skip_file")"
  exit 0
fi

exec "$@"
