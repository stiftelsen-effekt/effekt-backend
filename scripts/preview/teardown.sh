#!/usr/bin/env bash
# Deletes pull request <pr>'s preview: drops preview_pr_<n> (via its seed job), then deletes the
# job, the service and the PR's images. Safe to run when parts are already gone.
#
#   teardown.sh <pr>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

pr="${1:-}"
preview_require_pr "$pr"
service="$(preview_service_name "$pr")"
job="$(preview_job_name "$pr")"
R=(--project "$PREVIEW_PROJECT" --region "$PREVIEW_REGION")

if gcloud run jobs describe "$job" "${R[@]}" >/dev/null 2>&1; then
  # Executions without a completion time are still running (filtered here: gcloud's filter
  # can't test a timestamp field for presence).
  running="$(gcloud run jobs executions list --job "$job" "${R[@]}" \
    --format 'value(metadata.name,status.completionTime)' | awk 'NF == 1 { print $1 }')"
  for execution in $running; do
    gcloud run jobs executions cancel "$execution" "${R[@]}" --quiet || true
  done
  echo "== Dropping $(preview_db_name "$pr")"
  if ! gcloud run jobs execute "$job" "${R[@]}" --args drop --wait; then
    echo "::warning::Could not drop $(preview_db_name "$pr"); the next deploy of this PR number resets it anyway."
  fi
  echo "== Deleting job ${job}"
  gcloud run jobs delete "$job" "${R[@]}" --quiet
fi

if gcloud run services describe "$service" "${R[@]}" >/dev/null 2>&1; then
  echo "== Deleting service ${service}"
  gcloud run services delete "$service" "${R[@]}" --quiet
fi

echo "== Deleting images of #${pr}"
digests="$(gcloud artifacts docker images list "$PREVIEW_IMAGE_BASE" --project "$PREVIEW_PROJECT" \
  --include-tags --filter "tags ~ ^pr-${pr}-" --format 'value(version)' 2>/dev/null || true)"
for digest in $digests; do
  gcloud artifacts docker images delete "${PREVIEW_IMAGE_BASE}@${digest}" \
    --project "$PREVIEW_PROJECT" --delete-tags --quiet || true
done
echo "Preview of #${pr} torn down."
