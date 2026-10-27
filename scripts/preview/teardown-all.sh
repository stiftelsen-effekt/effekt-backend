#!/usr/bin/env bash
# Removes everything the preview pipeline and scripts/preview/provision.sh created.
#
#   scripts/preview/teardown-all.sh            dry run: prints every command
#   scripts/preview/teardown-all.sh --apply    deletes
#
# Order: per-PR previews (services, seed jobs), then shared resources. Only touches resources
# named in scripts/preview/config.sh; shared resources are deleted only when they carry the
# preview marker (label or description), so a same-named resource made by hand is left alone.
# Leaves the STS API enabled (harmless, and other things may use it by then).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

APPLY=false
case "${1:-}" in
  --apply) APPLY=true ;;
  "" | --dry-run) ;;
  *)
    echo "Usage: $0 [--apply]" >&2
    exit 2
    ;;
esac

P=(--project "$PREVIEW_PROJECT")
R=(--project "$PREVIEW_PROJECT" --region "$PREVIEW_REGION")

say() { printf '%s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }
run() {
  say "+ $*"
  if $APPLY; then "$@" || say "  (failed, continuing)"; fi
}
marked_label() {
  "$@" --format json 2>/dev/null |
    jq -e --arg k "${PREVIEW_MARKER_LABEL%%=*}" --arg v "${PREVIEW_MARKER_LABEL#*=}" \
      '(.labels // .settings.userLabels // {})[$k] == $v' >/dev/null
}
marked_description() {
  "$@" --format json 2>/dev/null |
    jq -e --arg d "$PREVIEW_MARKER_TEXT" '(.description // "") | contains($d)' >/dev/null
}

$APPLY || say "Dry run: nothing is deleted. Re-run with --apply."

section "Per-PR previews"
services="$(gcloud run services list "${R[@]}" \
  --filter "metadata.labels.preview=true AND metadata.name ~ ^${PREVIEW_SERVICE_PREFIX}" \
  --format 'value(metadata.name)' 2>/dev/null || true)"
jobs="$(gcloud run jobs list "${R[@]}" \
  --filter "metadata.labels.preview=true AND metadata.name ~ ^${PREVIEW_JOB_PREFIX}" \
  --format 'value(metadata.name)' 2>/dev/null || true)"
[[ -z "$services$jobs" ]] && say "  none"
for service in $services; do run gcloud run services delete "$service" "${R[@]}" --quiet; done
# The databases go with the instance below, so jobs are deleted without a drop.
for job in $jobs; do run gcloud run jobs delete "$job" "${R[@]}" --quiet; done

section "Workload identity federation"
provider=(gcloud iam workload-identity-pools providers describe "$PREVIEW_WIF_PROVIDER_ID"
  --workload-identity-pool "$PREVIEW_WIF_POOL" --location global "${P[@]}")
if marked_description "${provider[@]}"; then
  run gcloud iam workload-identity-pools providers delete "$PREVIEW_WIF_PROVIDER_ID" \
    --workload-identity-pool "$PREVIEW_WIF_POOL" --location global "${P[@]}" --quiet
fi
if marked_description gcloud iam workload-identity-pools describe "$PREVIEW_WIF_POOL" --location global "${P[@]}"; then
  run gcloud iam workload-identity-pools delete "$PREVIEW_WIF_POOL" --location global "${P[@]}" --quiet
fi

section "Project IAM bindings of the preview service accounts"
if gcloud iam service-accounts describe "$PREVIEW_RUN_SA" "${P[@]}" >/dev/null 2>&1; then
  run gcloud projects remove-iam-policy-binding "$PREVIEW_PROJECT" \
    --member "serviceAccount:${PREVIEW_RUN_SA}" --role roles/cloudsql.client --all --format none
fi
if gcloud iam service-accounts describe "$PREVIEW_CI_SA" "${P[@]}" >/dev/null 2>&1; then
  run gcloud projects remove-iam-policy-binding "$PREVIEW_PROJECT" \
    --member "serviceAccount:${PREVIEW_CI_SA}" --role "$PREVIEW_DEPLOYER_ROLE" --all --format none
fi

section "Custom role"
if marked_description gcloud iam roles describe "$PREVIEW_DEPLOYER_ROLE_ID" "${P[@]}"; then
  run gcloud iam roles delete "$PREVIEW_DEPLOYER_ROLE_ID" "${P[@]}" --quiet
fi

section "Service accounts (their resource-level bindings go with them)"
for sa in "$PREVIEW_CI_SA" "$PREVIEW_RUN_SA"; do
  if marked_description gcloud iam service-accounts describe "$sa" "${P[@]}"; then
    run gcloud iam service-accounts delete "$sa" "${P[@]}" --quiet
  fi
done

section "Cloud SQL instance (all preview_* databases)"
if marked_label gcloud sql instances describe "$PREVIEW_SQL_INSTANCE" "${P[@]}"; then
  run gcloud sql instances delete "$PREVIEW_SQL_INSTANCE" "${P[@]}" --quiet
fi

section "Secret"
if marked_label gcloud secrets describe "$PREVIEW_DB_PASSWORD_SECRET" "${P[@]}"; then
  run gcloud secrets delete "$PREVIEW_DB_PASSWORD_SECRET" "${P[@]}" --quiet
fi

section "Artifact Registry repository (all preview images)"
if marked_label gcloud artifacts repositories describe "$PREVIEW_AR_REPO" --location "$PREVIEW_REGION" "${P[@]}"; then
  run gcloud artifacts repositories delete "$PREVIEW_AR_REPO" --location "$PREVIEW_REGION" "${P[@]}" --quiet
fi

section "GitHub repository variables"
existing="$(gh variable list -R "$PREVIEW_GITHUB_REPO" --json name --jq '.[].name' 2>/dev/null || true)"
for name in PREVIEW_MAX PREVIEW_IDLE_WARN_DAYS PREVIEW_IDLE_DELETE_DAYS PREVIEW_GCP_PROJECT \
  PREVIEW_GCP_REGION PREVIEW_WIF_PROVIDER PREVIEW_CI_SA; do
  if grep -qx "$name" <<<"$existing"; then
    run gh variable delete "$name" -R "$PREVIEW_GITHUB_REPO"
  fi
done

section "Done"
say "Preview comments on pull requests are left as they are."
