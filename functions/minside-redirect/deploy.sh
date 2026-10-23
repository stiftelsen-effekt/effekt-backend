#!/usr/bin/env bash
# Redeploys the minside-redirect Cloud Function in place.
#
# It stays 1st gen because the external HTTPS load balancer for
# minside.gieffektivt.no (url-map min-side-redirect -> backend service
# minside-redirect) reaches it through the serverless NEG
# min-side-redirect-function, which points at this 1st gen function by name.
#
# nodejs24 is only offered on 2nd gen (`gcloud functions runtimes list`), so
# 1st gen uses nodejs22, the newest runtime it has. Using nodejs24 means
# moving to 2nd gen and re-pointing the NEG, or replacing the function with
# a URL-map redirect (see the PR description).
set -euo pipefail
cd "$(dirname "$0")"

RUNTIME="${RUNTIME:-nodejs22}"

gcloud functions deploy minside-redirect \
  --project hidden-display-243419 \
  --region europe-west1 \
  --no-gen2 \
  --runtime "$RUNTIME" \
  --entry-point prod \
  --trigger-http \
  --allow-unauthenticated \
  --memory 256MB \
  --timeout 60s \
  --service-account hidden-display-243419@appspot.gserviceaccount.com \
  --source .
