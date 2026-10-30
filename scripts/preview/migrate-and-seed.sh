#!/usr/bin/env bash
# Runs inside the preview image (apps/api/Dockerfile.preview) as the Cloud Run Job
# effekt-preview-seed-pr-<n>, or locally against a throwaway MySQL:
#
#   migrate-and-seed.sh          drop + create DB_NAME, apply migrations, seed synthetic data
#   migrate-and-seed.sh drop     drop DB_NAME (preview teardown)
#
# Every step starts with the preview startup guard: it only ever touches a preview_* database
# on the effekt-previews instance, with no production integration configured.
set -euo pipefail

# Works in the API package (apps/api): its dist/, node_modules/ and prisma/ are used below
cd "$(dirname "$0")/../../apps/api"
command="${1:-reset}"
cli=(node dist/custom_modules/preview/databaseCli.js)

"${cli[@]}" guard

case "$command" in
  reset)
    "${cli[@]}" reset
    DB_URL="$("${cli[@]}" url prisma)"
    export DB_URL
    node_modules/.bin/prisma migrate deploy
    # The seed uses mysql2, which takes the Cloud SQL socket as `socketPath`
    DB_URL="$("${cli[@]}" url mysql2)" node dist-seed/prisma/seed.js
    # DB_URL (still the Prisma one) reaches the CLI through prisma.config.ts
    node_modules/.bin/prisma db execute --file prisma/dev/fulltext-search.sql
    "${cli[@]}" analyze
    echo "Preview database ${DB_NAME} migrated and seeded at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    ;;
  drop)
    "${cli[@]}" drop
    ;;
  *)
    echo "Usage: $0 [reset|drop]" >&2
    exit 2
    ;;
esac
