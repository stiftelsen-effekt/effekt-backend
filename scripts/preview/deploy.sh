#!/usr/bin/env bash
# Deploys pull request <pr>'s preview from an image already pushed to Artifact Registry:
#   1. cancels seed runs still going for this PR (a newer push supersedes them)
#   2. Cloud Run Job effekt-preview-seed-pr-<n>: drop + create preview_pr_<n>, migrate, seed
#   3. Cloud Run service effekt-preview-pr-<n> (min 0, max 2, public, PREVIEW_MODE)
#
#   deploy.sh <pr> <image> <sha>
#
# Prints url=… and seeded_at=… (and appends them to $GITHUB_OUTPUT when set).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

pr="${1:-}"
image="${2:?image}"
sha="${3:?sha}"
preview_require_pr "$pr"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
  echo "Not a commit SHA: ${sha}" >&2
  exit 2
}
[[ "$image" == "${PREVIEW_IMAGE_BASE}:"* ]] || {
  echo "Image must be in ${PREVIEW_IMAGE_BASE}" >&2
  exit 2
}

service="$(preview_service_name "$pr")"
job="$(preview_job_name "$pr")"
db="$(preview_db_name "$pr")"
url="$(preview_url "$pr")"
R=(--project "$PREVIEW_PROJECT" --region "$PREVIEW_REGION")

# Signs this preview's "Continue as…" sessions. New per deploy; only valid with PREVIEW_MODE.
jwt_secret="$(openssl rand -hex 32)"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::add-mask::${jwt_secret}"; fi

common_env="PREVIEW_MODE=true,NODE_ENV=preview,DB_NAME=${db},DB_USER=${PREVIEW_SQL_USER}"
common_env+=",CLOUD_SQL_CONNECTION_NAME=${PREVIEW_SQL_CONNECTION},PREVIEW_JWT_SECRET=${jwt_secret}"
labels="preview=true,pr=${pr},sha=${sha:0:7}"

echo "== Cancelling seed runs still going for #${pr}"
if gcloud run jobs describe "$job" "${R[@]}" >/dev/null 2>&1; then
  # Executions without a completion time are still running. (gcloud's filter can't test a
  # timestamp field for presence, so the check is done here.)
  running="$(gcloud run jobs executions list --job "$job" "${R[@]}" \
    --format 'value(metadata.name,status.completionTime)' | awk 'NF == 1 { print $1 }')"
  for execution in $running; do
    gcloud run jobs executions cancel "$execution" "${R[@]}" --quiet || true
  done
fi

echo "== Migrating and seeding ${db}"
gcloud run jobs deploy "$job" "${R[@]}" \
  --image "$image" \
  --service-account "$PREVIEW_RUN_SA" \
  --set-cloudsql-instances "$PREVIEW_SQL_CONNECTION" \
  --set-env-vars "$common_env" \
  --set-secrets "DB_PASS=${PREVIEW_DB_PASSWORD_SECRET}:latest" \
  --command /usr/src/app/scripts/preview/migrate-and-seed.sh \
  --args reset \
  --labels "$labels" \
  --cpu 1 --memory 1Gi --max-retries 0 --task-timeout 15m \
  --execute-now --wait
seeded_at="$(date -u '+%Y-%m-%d %H:%M UTC')"
seeded_iso="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

echo "== Deploying ${service}"
gcloud run deploy "$service" "${R[@]}" \
  --image "$image" \
  --service-account "$PREVIEW_RUN_SA" \
  --set-cloudsql-instances "$PREVIEW_SQL_CONNECTION" \
  --set-env-vars "${common_env},PREVIEW_PR=${pr},PREVIEW_SHA=${sha},PREVIEW_SEEDED_AT=${seeded_iso},EFFEKT_API_URL=${url}" \
  --set-secrets "DB_PASS=${PREVIEW_DB_PASSWORD_SECRET}:latest" \
  --labels "${labels},deployed-at=$(date -u +%s)" \
  --ingress all --no-invoker-iam-check \
  --min-instances 0 --max-instances 2 \
  --cpu 1 --memory 512Mi --concurrency 80 --timeout 300 \
  --description "Preview of ${PREVIEW_GITHUB_REPO}#${pr} (synthetic data)" \
  --quiet

actual_url="$(gcloud run services describe "$service" "${R[@]}" --format 'value(status.url)')"
echo "url=${actual_url:-$url}"
echo "seeded_at=${seeded_at}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "url=${actual_url:-$url}"
    echo "seeded_at=${seeded_at}"
  } >>"$GITHUB_OUTPUT"
fi
