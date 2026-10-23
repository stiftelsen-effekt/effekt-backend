#!/usr/bin/env bash
# Deploys the scheduled-jobs dispatcher (Cloud Run function, gen2).
# Cloud Scheduler calls it with OIDC as api-scheduled@ and ?type=<job>; it calls effektapi /scheduled/*.
set -euo pipefail
cd "$(dirname "$0")"
gcloud run deploy api-scheduled \
  --project hidden-display-243419 --region europe-west1 \
  --source . --function default --base-image nodejs24 \
  --service-account api-scheduled@hidden-display-243419.iam.gserviceaccount.com \
  --no-allow-unauthenticated --memory 1Gi --timeout 500 --max-instances 10 \
  --set-secrets CLIENTID=cloud_scheduler_auth0_clientid:latest,CLIENTSECRET=cloud_scheduler_auth0_secret:latest,ADOVEO_USERNAME=adoveo_username_no:latest,ADOVEO_PASSWORD=adoveo_password_no:latest
