#!/usr/bin/env bash
# Deploys the scheduled-jobs dispatcher (Cloud Run function, gen2).
# Cloud Scheduler calls it with OIDC as api-scheduled@ and ?type=<job>; it calls effektapi /scheduled/*.
set -euo pipefail
cd "$(dirname "$0")"

# The function is a package of the pnpm workspace. `pnpm deploy` copies it to a folder of its own
# with a lockfile for just its production dependencies; Cloud Build installs them from that
# lockfile with pnpm.
out="$(mktemp -d)/api-scheduled"
trap 'rm -rf "$(dirname "$out")"' EXIT
pnpm --filter api-scheduled deploy --prod "$out"
rm -rf "$out/node_modules"
gcloud run deploy api-scheduled \
  --project hidden-display-243419 --region europe-west1 \
  --source "$out" --function default --base-image nodejs24 \
  --service-account api-scheduled@hidden-display-243419.iam.gserviceaccount.com \
  --no-allow-unauthenticated --memory 1Gi --timeout 500 --max-instances 10 \
  --set-secrets CLIENTID=cloud_scheduler_auth0_clientid:latest,CLIENTSECRET=cloud_scheduler_auth0_secret:latest
