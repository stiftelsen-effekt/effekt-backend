# shellcheck shell=bash disable=SC2034
# Names shared by the preview scripts (provision, teardown, workflow helpers).
# Sourced, not executed. Every resource the preview pipeline owns is named here.

PREVIEW_PROJECT="${PREVIEW_PROJECT:-hidden-display-243419}"
PREVIEW_PROJECT_NUMBER="${PREVIEW_PROJECT_NUMBER:-1073854556440}"
PREVIEW_REGION="${PREVIEW_REGION:-europe-north1}"
PREVIEW_GITHUB_REPO="${PREVIEW_GITHUB_REPO:-stiftelsen-effekt/effekt-backend}"
PREVIEW_GITHUB_REPO_ID="${PREVIEW_GITHUB_REPO_ID:-86714950}"
PREVIEW_GITHUB_OWNER_ID="${PREVIEW_GITHUB_OWNER_ID:-51704270}"
PREVIEW_DEFAULT_BRANCH="${PREVIEW_DEFAULT_BRANCH:-master}"

# Cloud SQL
PREVIEW_SQL_INSTANCE="effekt-previews"
PREVIEW_SQL_TIER="${PREVIEW_SQL_TIER:-db-g1-small}"
PREVIEW_SQL_USER="preview"
PREVIEW_SQL_CONNECTION="${PREVIEW_PROJECT}:${PREVIEW_REGION}:${PREVIEW_SQL_INSTANCE}"
PREVIEW_DB_PASSWORD_SECRET="effekt-preview-db-password"

# Artifact Registry
PREVIEW_AR_REPO="effekt-previews"
PREVIEW_IMAGE_BASE="${PREVIEW_REGION}-docker.pkg.dev/${PREVIEW_PROJECT}/${PREVIEW_AR_REPO}/backend"

# Identities
PREVIEW_RUN_SA_NAME="effekt-preview-run"
PREVIEW_CI_SA_NAME="effekt-preview-ci"
PREVIEW_RUN_SA="${PREVIEW_RUN_SA_NAME}@${PREVIEW_PROJECT}.iam.gserviceaccount.com"
PREVIEW_CI_SA="${PREVIEW_CI_SA_NAME}@${PREVIEW_PROJECT}.iam.gserviceaccount.com"
PREVIEW_DEPLOYER_ROLE_ID="effektPreviewDeployer"
PREVIEW_DEPLOYER_ROLE="projects/${PREVIEW_PROJECT}/roles/${PREVIEW_DEPLOYER_ROLE_ID}"
PREVIEW_WIF_POOL="github-effekt-previews"
PREVIEW_WIF_PROVIDER_ID="effekt-backend"
PREVIEW_WIF_PROVIDER="projects/${PREVIEW_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${PREVIEW_WIF_POOL}/providers/${PREVIEW_WIF_PROVIDER_ID}"

# Cloud Run naming: services effekt-preview-pr-<n>, jobs effekt-preview-seed-pr-<n>
PREVIEW_SERVICE_PREFIX="effekt-preview-pr-"
PREVIEW_JOB_PREFIX="effekt-preview-seed-pr-"

# Marks resources created by scripts/preview/provision.sh (label or description)
PREVIEW_MARKER_LABEL="managed-by=effekt-preview-provision"
PREVIEW_MARKER_TEXT="Managed by scripts/preview/provision.sh (preview environments)"

preview_service_name() { echo "${PREVIEW_SERVICE_PREFIX}$1"; }
preview_job_name() { echo "${PREVIEW_JOB_PREFIX}$1"; }
preview_db_name() { echo "preview_pr_$1"; }
# Deterministic Cloud Run URL (https://SERVICE-PROJECT_NUMBER.REGION.run.app)
preview_url() { echo "https://$(preview_service_name "$1")-${PREVIEW_PROJECT_NUMBER}.${PREVIEW_REGION}.run.app"; }

# Refuses anything that is not a positive PR number (names are built from it).
preview_require_pr() {
  if [[ ! "${1:-}" =~ ^[1-9][0-9]{0,6}$ ]]; then
    echo "Not a pull request number: '${1:-}'" >&2
    exit 2
  fi
}
