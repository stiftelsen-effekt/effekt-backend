#!/usr/bin/env bash
# Deploys the DMARC report reader (Cloud Run function, gen2).
# Cloud Scheduler calls it with OIDC as api-scheduled@: ?mode=daily (alerts) and ?mode=weekly (summary).
set -euo pipefail
cd "$(dirname "$0")"

# The function is a package of the pnpm workspace. `pnpm deploy` copies it to a folder of its own
# with a lockfile for just its production dependencies; Cloud Build installs them from that
# lockfile with pnpm.
out="$(mktemp -d)/dmarc-report"
trap 'rm -rf "$(dirname "$out")"' EXIT
pnpm --filter dmarc-report deploy --prod "$out"
rm -rf "$out/node_modules"
gcloud run deploy dmarc-report \
  --project hidden-display-243419 --region europe-north1 \
  --source "$out" --function default --base-image nodejs24 \
  --service-account sa-dmarc-report@hidden-display-243419.iam.gserviceaccount.com \
  --no-allow-unauthenticated --memory 512Mi --timeout 300 --max-instances 1 \
  --set-env-vars DMARC_MAILBOX_USER=dmarc@gieffektivt.no \
  --set-secrets DMARC_MAILBOX_PASSWORD=dmarc-mailbox-password:latest,SLACK_WEBHOOK_URL=dmarc-slack-webhook:latest
