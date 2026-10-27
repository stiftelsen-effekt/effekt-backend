#!/usr/bin/env bash
# Creates the infrastructure for per-PR preview environments (docs/preview-environments.md).
#
#   scripts/preview/provision.sh            dry run: checks names, prints every command
#   scripts/preview/provision.sh --apply    creates the resources
#
# Creates ONLY new resources, all named in scripts/preview/config.sh:
#   - Cloud SQL instance effekt-previews (+ user `preview`, password in Secret Manager)
#   - Artifact Registry repository effekt-previews (with a cleanup policy)
#   - service accounts effekt-preview-run (runtime) and effekt-preview-ci (GitHub Actions)
#   - custom role effektPreviewDeployer, workload identity pool + provider for GitHub Actions
#   - GitHub repository variables PREVIEW_* (gh variable set)
# plus additive IAM bindings for the two new service accounts, and enabling the STS API
# (needed for workload identity federation) if it is off.
#
# Idempotent: a resource that already exists and carries the preview marker (label or
# description) is skipped; one that exists without it is a name clash and stops the script
# before anything is created. It never changes or deletes an existing resource.
# Requires: gcloud (authenticated, project owner or equivalent), gh (repo admin), jq, openssl.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

APPLY=false
case "${1:-}" in
  --apply) APPLY=true ;;
  "" | --dry-run) ;;
  -h | --help)
    sed -n '2,20p' "$0"
    exit 0
    ;;
  *)
    echo "Unknown argument: $1 (use --apply, or nothing for a dry run)" >&2
    exit 2
    ;;
esac

P=(--project "$PREVIEW_PROJECT")
PLANNED=()

say() { printf '%s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }

# Quotes arguments that need it, so printed commands can be copied: single quotes, or double
# quotes when the argument itself contains a single quote (the IAM condition expressions).
quoted() {
  local arg out=""
  for arg in "$@"; do
    if [[ "$arg" =~ ^[A-Za-z0-9_./:@%+=,-]+$ ]]; then
      out+="${arg} "
    elif [[ "$arg" != *"'"* ]]; then
      out+="'${arg}' "
    else
      out+="\"${arg}\" "
    fi
  done
  printf '%s' "${out% }"
}

# Prints the command; runs it with --apply. Secrets are passed as separate variables and shown
# as <generated> so they never reach the terminal or logs.

run() {
  local shown
  shown="$(quoted "$@")"
  if [[ -n "${REDACT:-}" ]]; then shown="${shown//${REDACT}/<generated>}"; fi
  say "+ ${shown}"
  PLANNED+=("$shown")
  if $APPLY; then "$@"; fi
}

# IAM changes right after creating a service account can fail until it has propagated.
run_retry() {
  if ! $APPLY; then
    run "$@"
    return
  fi
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if run "$@"; then return 0; fi
    say "  (attempt ${attempt} failed, waiting for IAM propagation)"
    sleep 15
  done
  return 1
}

exists() { "$@" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------------------------
section "Read-only checks"

for tool in gcloud gh jq openssl; do
  command -v "$tool" >/dev/null || {
    echo "Missing tool: $tool" >&2
    exit 1
  }
done

say "Project ${PREVIEW_PROJECT} (${PREVIEW_PROJECT_NUMBER}), region ${PREVIEW_REGION}, repo ${PREVIEW_GITHUB_REPO}"
actual_number="$(gcloud projects describe "$PREVIEW_PROJECT" --format='value(projectNumber)')"
if [[ "$actual_number" != "$PREVIEW_PROJECT_NUMBER" ]]; then
  echo "Project number mismatch: ${actual_number} != ${PREVIEW_PROJECT_NUMBER}" >&2
  exit 1
fi
actual_repo_id="$(gh api "repos/${PREVIEW_GITHUB_REPO}" --jq .id)"
if [[ "$actual_repo_id" != "$PREVIEW_GITHUB_REPO_ID" ]]; then
  echo "GitHub repository id mismatch: ${actual_repo_id} != ${PREVIEW_GITHUB_REPO_ID}" >&2
  exit 1
fi

# Works with the bash 3.2 that ships with macOS (no associative arrays).
NEW_KEYS=""
CLASHES=()
check() {
  local key="$1" marker_ok="$2"
  shift 2
  if exists "$@"; then
    if [[ "$marker_ok" == "yes" ]]; then
      say "  exists (ours, skip): ${key}"
    else
      CLASHES+=("$key")
      say "  CLASH: ${key} exists and was not created by this script"
    fi
  else
    NEW_KEYS="${NEW_KEYS}${key}"$'\n'
    say "  free: ${key}"
  fi
}

has_label() { # has_label <json> -> checks the marker label
  local key="${PREVIEW_MARKER_LABEL%%=*}" value="${PREVIEW_MARKER_LABEL#*=}"
  jq -e --arg k "$key" --arg v "$value" '(.labels // .settings.userLabels // {})[$k] == $v' >/dev/null
}
has_description() {
  jq -e --arg d "$PREVIEW_MARKER_TEXT" '(.description // "") | contains($d)' >/dev/null
}
marker() { # marker <label|description> <describe command...>
  local kind="$1"
  shift
  local json
  json="$("$@" --format=json 2>/dev/null)" || {
    echo "no"
    return
  }
  if [[ "$kind" == label ]] && has_label <<<"$json"; then
    echo yes
  elif [[ "$kind" == description ]] && has_description <<<"$json"; then
    echo yes
  else echo no; fi
}

sql_describe=(gcloud sql instances describe "$PREVIEW_SQL_INSTANCE" "${P[@]}")
check "sql-instance/${PREVIEW_SQL_INSTANCE}" "$(marker label "${sql_describe[@]}")" "${sql_describe[@]}"
ar_describe=(gcloud artifacts repositories describe "$PREVIEW_AR_REPO" --location "$PREVIEW_REGION" "${P[@]}")
check "artifact-registry/${PREVIEW_AR_REPO}" "$(marker label "${ar_describe[@]}")" "${ar_describe[@]}"
secret_describe=(gcloud secrets describe "$PREVIEW_DB_PASSWORD_SECRET" "${P[@]}")
check "secret/${PREVIEW_DB_PASSWORD_SECRET}" "$(marker label "${secret_describe[@]}")" "${secret_describe[@]}"
for sa in "$PREVIEW_RUN_SA" "$PREVIEW_CI_SA"; do
  sa_describe=(gcloud iam service-accounts describe "$sa" "${P[@]}")
  check "service-account/${sa}" "$(marker description "${sa_describe[@]}")" "${sa_describe[@]}"
done
role_describe=(gcloud iam roles describe "$PREVIEW_DEPLOYER_ROLE_ID" "${P[@]}")
check "role/${PREVIEW_DEPLOYER_ROLE_ID}" "$(marker description "${role_describe[@]}")" "${role_describe[@]}"
if exists "${role_describe[@]}" &&
  [[ "$(gcloud iam roles describe "$PREVIEW_DEPLOYER_ROLE_ID" "${P[@]}" --format='value(deleted)')" == True ]]; then
  echo "The custom role ${PREVIEW_DEPLOYER_ROLE_ID} is deleted; undelete it (gcloud iam roles undelete) or wait until it is purged." >&2
  exit 1
fi
pool_describe=(gcloud iam workload-identity-pools describe "$PREVIEW_WIF_POOL" --location global "${P[@]}")
check "wif-pool/${PREVIEW_WIF_POOL}" "$(marker description "${pool_describe[@]}")" "${pool_describe[@]}"
provider_describe=(gcloud iam workload-identity-pools providers describe "$PREVIEW_WIF_PROVIDER_ID"
  --workload-identity-pool "$PREVIEW_WIF_POOL" --location global "${P[@]}")
check "wif-provider/${PREVIEW_WIF_PROVIDER_ID}" "$(marker description "${provider_describe[@]}")" "${provider_describe[@]}"

# Cloud Run names this pipeline will create per PR must not collide with anything existing
existing_run="$(gcloud run services list --region "$PREVIEW_REGION" "${P[@]}" --format='value(metadata.name)' 2>/dev/null || true)
$(gcloud run jobs list --region "$PREVIEW_REGION" "${P[@]}" --format='value(metadata.name)' 2>/dev/null || true)"
foreign_preview_names="$(grep -E "^(${PREVIEW_SERVICE_PREFIX}|${PREVIEW_JOB_PREFIX})" <<<"$existing_run" || true)"
if [[ -n "$foreign_preview_names" ]]; then
  say "  note: Cloud Run resources already use the preview prefix (from an earlier run of the pipeline?):"
  say "$foreign_preview_names" | sed 's/^/    /'
else
  say "  free: Cloud Run names ${PREVIEW_SERVICE_PREFIX}* / ${PREVIEW_JOB_PREFIX}*"
fi

DESIRED_VARS=(
  "PREVIEW_CI_SA=${PREVIEW_CI_SA}"
  "PREVIEW_GCP_PROJECT=${PREVIEW_PROJECT}"
  "PREVIEW_GCP_REGION=${PREVIEW_REGION}"
  "PREVIEW_IDLE_DELETE_DAYS=21"
  "PREVIEW_IDLE_WARN_DAYS=14"
  "PREVIEW_MAX=5"
  "PREVIEW_WIF_PROVIDER=${PREVIEW_WIF_PROVIDER}"
)
existing_vars_json="$(gh variable list -R "$PREVIEW_GITHUB_REPO" --json name,value 2>/dev/null || echo '[]')"
VARS_TO_SET=()
for entry in "${DESIRED_VARS[@]}"; do
  name="${entry%%=*}"
  value="${entry#*=}"
  current="$(jq -r --arg n "$name" '.[] | select(.name == $n) | .value' <<<"$existing_vars_json")"
  if [[ -z "$current" ]]; then
    VARS_TO_SET+=("$entry")
    say "  free: GitHub variable ${name}"
  elif [[ "$current" == "$value" ]]; then
    say "  exists (same value, skip): GitHub variable ${name}"
  else
    say "  exists with another value, left unchanged: GitHub variable ${name}=${current}"
  fi
done

if ((${#CLASHES[@]} > 0)); then
  echo >&2
  echo "Name clash with existing resources, nothing was created: ${CLASHES[*]}" >&2
  exit 1
fi

new() { grep -qxF "$1" <<<"$NEW_KEYS"; }

if $APPLY; then
  say $'\nApplying.'
else
  say $'\nDry run: nothing below is executed. Re-run with --apply to create.'
fi

# ---------------------------------------------------------------------------------------------
section "APIs (enable only those that are off)"
enabled="$(gcloud services list --enabled "${P[@]}" --format='value(config.name)' 2>/dev/null || true)"
for api in sts.googleapis.com iamcredentials.googleapis.com run.googleapis.com \
  sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com; do
  if grep -qx "$api" <<<"$enabled"; then
    say "  already enabled: ${api}"
  else
    run gcloud services enable "$api" "${P[@]}"
  fi
done

# ---------------------------------------------------------------------------------------------
section "Service accounts"
if new "service-account/${PREVIEW_RUN_SA}"; then
  run gcloud iam service-accounts create "$PREVIEW_RUN_SA_NAME" "${P[@]}" \
    --display-name "Effekt preview runtime" \
    --description "Runtime identity of preview Cloud Run services and seed jobs. Cloud SQL client on effekt-previews only. ${PREVIEW_MARKER_TEXT}"
fi
if new "service-account/${PREVIEW_CI_SA}"; then
  run gcloud iam service-accounts create "$PREVIEW_CI_SA_NAME" "${P[@]}" \
    --display-name "Effekt preview CI (GitHub Actions)" \
    --description "Deploys per-PR previews from GitHub Actions via workload identity federation. ${PREVIEW_MARKER_TEXT}"
fi

# ---------------------------------------------------------------------------------------------
section "Artifact Registry"
if new "artifact-registry/${PREVIEW_AR_REPO}"; then
  run gcloud artifacts repositories create "$PREVIEW_AR_REPO" "${P[@]}" \
    --repository-format docker --location "$PREVIEW_REGION" \
    --description "Per-PR preview images. ${PREVIEW_MARKER_TEXT}" \
    --labels "preview=true,${PREVIEW_MARKER_LABEL}"
  policy_file="$(mktemp)"
  cat >"$policy_file" <<'POLICY'
[
  {"name": "delete-older-than-30-days", "action": {"type": "Delete"},
   "condition": {"tagState": "any", "olderThan": "30d"}},
  {"name": "delete-untagged", "action": {"type": "Delete"},
   "condition": {"tagState": "untagged", "olderThan": "1d"}}
]
POLICY
  say "  cleanup policy ($(tr -s ' \n' ' ' <"$policy_file"))"
  run gcloud artifacts repositories set-cleanup-policies "$PREVIEW_AR_REPO" "${P[@]}" \
    --location "$PREVIEW_REGION" --policy "$policy_file" --no-dry-run
fi

# ---------------------------------------------------------------------------------------------
section "Cloud SQL (separate instance, synthetic data only)"
if new "sql-instance/${PREVIEW_SQL_INSTANCE}"; then
  # Root password is random and not stored: nothing uses root; an owner can reset it.
  REDACT="$(openssl rand -hex 24)"
  run gcloud beta sql instances create "$PREVIEW_SQL_INSTANCE" "${P[@]}" \
    --database-version MYSQL_8_4 --edition enterprise --tier "$PREVIEW_SQL_TIER" \
    --region "$PREVIEW_REGION" --availability-type zonal \
    --storage-type SSD --storage-size 10 --no-storage-auto-increase \
    --no-backup \
    --database-flags log_bin_trust_function_creators=on \
    --root-password "$REDACT" \
    --labels "preview=true,${PREVIEW_MARKER_LABEL}" \
    --no-deletion-protection
  REDACT=""
fi
if new "secret/${PREVIEW_DB_PASSWORD_SECRET}"; then
  db_password="$(openssl rand -hex 24)"
  say "+ gcloud secrets create ${PREVIEW_DB_PASSWORD_SECRET} ${P[*]} --replication-policy automatic --labels preview=true,${PREVIEW_MARKER_LABEL} --data-file - <<< <generated>"
  PLANNED+=("gcloud secrets create ${PREVIEW_DB_PASSWORD_SECRET} (generated password)")
  if $APPLY; then
    printf '%s' "$db_password" | gcloud secrets create "$PREVIEW_DB_PASSWORD_SECRET" "${P[@]}" \
      --replication-policy automatic --labels "preview=true,${PREVIEW_MARKER_LABEL}" --data-file -
  fi
  REDACT="$db_password"
  run gcloud sql users create "$PREVIEW_SQL_USER" "${P[@]}" \
    --instance "$PREVIEW_SQL_INSTANCE" --host % --password "$db_password"
  REDACT=""
  unset db_password
else
  say "  secret exists: user ${PREVIEW_SQL_USER} was created with it earlier"
fi

# ---------------------------------------------------------------------------------------------
section "Custom role for the CI service account (Cloud Run previews only)"
deployer_permissions=(
  run.services.create run.services.get run.services.list run.services.update run.services.delete
  run.services.getIamPolicy run.services.setIamPolicy
  run.jobs.create run.jobs.get run.jobs.list run.jobs.update run.jobs.delete
  run.jobs.run run.jobs.runWithOverrides
  run.executions.get run.executions.list run.executions.cancel run.executions.delete
  run.tasks.get run.tasks.list
  run.revisions.get run.revisions.list run.revisions.delete
  run.configurations.get run.configurations.list run.routes.get run.routes.list
  run.operations.get run.operations.list run.locations.list
)
if new "role/${PREVIEW_DEPLOYER_ROLE_ID}"; then
  run gcloud iam roles create "$PREVIEW_DEPLOYER_ROLE_ID" "${P[@]}" \
    --title "Effekt preview deployer" \
    --description "Deploy, list and delete per-PR preview Cloud Run services and jobs. ${PREVIEW_MARKER_TEXT}" \
    --stage GA \
    --permissions "$(
      IFS=,
      echo "${deployer_permissions[*]}"
    )"
fi

# ---------------------------------------------------------------------------------------------
section "IAM bindings (additive, only for the new service accounts)"
# Runtime SA: connect to the previews instance only (IAM condition on the instance name).
run_retry gcloud projects add-iam-policy-binding "$PREVIEW_PROJECT" \
  --member "serviceAccount:${PREVIEW_RUN_SA}" --role roles/cloudsql.client \
  --condition "title=effekt-previews-only,description=Only the effekt-previews Cloud SQL instance,expression=resource.name == 'projects/${PREVIEW_PROJECT}/instances/${PREVIEW_SQL_INSTANCE}' && resource.type == 'sqladmin.googleapis.com/Instance'" \
  --format none
# Runtime SA: read the preview DB password (this one secret).
run_retry gcloud secrets add-iam-policy-binding "$PREVIEW_DB_PASSWORD_SECRET" "${P[@]}" \
  --member "serviceAccount:${PREVIEW_RUN_SA}" --role roles/secretmanager.secretAccessor --format none
# CI SA: Cloud Run previews (custom role, project level: services that don't exist yet).
run_retry gcloud projects add-iam-policy-binding "$PREVIEW_PROJECT" \
  --member "serviceAccount:${PREVIEW_CI_SA}" --role "$PREVIEW_DEPLOYER_ROLE" \
  --condition None --format none
# CI SA: push and delete preview images (this repository only).
run_retry gcloud artifacts repositories add-iam-policy-binding "$PREVIEW_AR_REPO" "${P[@]}" \
  --location "$PREVIEW_REGION" \
  --member "serviceAccount:${PREVIEW_CI_SA}" --role roles/artifactregistry.repoAdmin --format none
# CI SA: deploy services/jobs that run as the runtime SA (and no other SA).
run_retry gcloud iam service-accounts add-iam-policy-binding "$PREVIEW_RUN_SA" "${P[@]}" \
  --member "serviceAccount:${PREVIEW_CI_SA}" --role roles/iam.serviceAccountUser --format none

# ---------------------------------------------------------------------------------------------
section "Workload identity federation (GitHub Actions -> CI SA)"
if new "wif-pool/${PREVIEW_WIF_POOL}"; then
  run gcloud iam workload-identity-pools create "$PREVIEW_WIF_POOL" "${P[@]}" --location global \
    --display-name "GitHub previews" \
    --description "GitHub Actions of ${PREVIEW_GITHUB_REPO}. ${PREVIEW_MARKER_TEXT}"
fi
# Only this repository (by immutable id), only workflows running from the default branch
# (pull_request_target and schedule run the default branch's workflow file), and only the
# two preview workflows. A PR that edits a workflow cannot obtain credentials with its edit.
wif_condition="assertion.repository_id == '${PREVIEW_GITHUB_REPO_ID}' && assertion.repository_owner_id == '${PREVIEW_GITHUB_OWNER_ID}' && assertion.ref == 'refs/heads/${PREVIEW_DEFAULT_BRANCH}' && (assertion.job_workflow_ref == '${PREVIEW_GITHUB_REPO}/.github/workflows/preview.yml@refs/heads/${PREVIEW_DEFAULT_BRANCH}' || assertion.job_workflow_ref == '${PREVIEW_GITHUB_REPO}/.github/workflows/preview-janitor.yml@refs/heads/${PREVIEW_DEFAULT_BRANCH}')"
if new "wif-provider/${PREVIEW_WIF_PROVIDER_ID}"; then
  run gcloud iam workload-identity-pools providers create-oidc "$PREVIEW_WIF_PROVIDER_ID" "${P[@]}" \
    --location global --workload-identity-pool "$PREVIEW_WIF_POOL" \
    --display-name "effekt-backend previews" \
    --description "${PREVIEW_GITHUB_REPO} preview workflows on ${PREVIEW_DEFAULT_BRANCH}. ${PREVIEW_MARKER_TEXT}" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.job_workflow_ref,attribute.event_name=assertion.event_name" \
    --attribute-condition "$wif_condition"
fi
run_retry gcloud iam service-accounts add-iam-policy-binding "$PREVIEW_CI_SA" "${P[@]}" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PREVIEW_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${PREVIEW_WIF_POOL}/attribute.repository_id/${PREVIEW_GITHUB_REPO_ID}" \
  --format none

# ---------------------------------------------------------------------------------------------
section "GitHub repository variables (${PREVIEW_GITHUB_REPO})"
if ((${#VARS_TO_SET[@]} == 0)); then say "  nothing to set"; fi
for entry in ${VARS_TO_SET[@]+"${VARS_TO_SET[@]}"}; do
  run gh variable set "${entry%%=*}" -R "$PREVIEW_GITHUB_REPO" --body "${entry#*=}"
done

section "Summary"
say "${#PLANNED[@]} command(s) $($APPLY && echo executed || echo "would run")."
say "Not done by this script (one-time, by the repo owner):"
say "  - install the Claude GitHub app on ${PREVIEW_GITHUB_REPO} and add the ANTHROPIC_API_KEY secret (for @claude)"
say "  - merge the preview workflows to ${PREVIEW_DEFAULT_BRANCH}: they run from there (pull_request_target)"
