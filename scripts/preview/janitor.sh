#!/usr/bin/env bash
# Nightly clean-up of preview environments (.github/workflows/preview-janitor.yml):
#   - deletes previews whose PR is closed (or gone)
#   - comments once on previews with no deploy for PREVIEW_IDLE_WARN_DAYS (default 14)
#   - deletes previews with no deploy for PREVIEW_IDLE_DELETE_DAYS (default 21)
#   - deletes leftover seed jobs whose service is gone
#
#   janitor.sh            act
#   janitor.sh --dry-run  only report what it would do
# Env: GH_TOKEN, GITHUB_REPOSITORY, PREVIEW_IDLE_WARN_DAYS, PREVIEW_IDLE_DELETE_DAYS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

dry_run=false
[[ "${1:-}" == --dry-run ]] && dry_run=true
warn_days="${PREVIEW_IDLE_WARN_DAYS:-14}"
delete_days="${PREVIEW_IDLE_DELETE_DAYS:-21}"
[[ "$warn_days" =~ ^[0-9]+$ ]] || warn_days=14
[[ "$delete_days" =~ ^[0-9]+$ ]] || delete_days=21
repo="${GITHUB_REPOSITORY:-$PREVIEW_GITHUB_REPO}"
R=(--project "$PREVIEW_PROJECT" --region "$PREVIEW_REGION")
now="$(date -u +%s)"

act() {
  echo "  -> $*"
  if ! $dry_run; then "$@"; fi
}

teardown() {
  local pr="$1" note="$2"
  local note_file
  note_file="$(mktemp)"
  printf '%s\n' "$note" >"$note_file"
  act "${SCRIPT_DIR}/teardown.sh" "$pr"
  act "${SCRIPT_DIR}/pr-comment.sh" "$pr" torn-down --note-file "$note_file"
}

services="$(gcloud run services list "${R[@]}" \
  --filter "metadata.labels.preview=true AND metadata.name ~ ^${PREVIEW_SERVICE_PREFIX}" \
  --format json)"
echo "$(jq length <<<"$services") preview(s); warn after ${warn_days} days idle, delete after ${delete_days}."

while IFS=$'\t' read -r pr deployed; do
  [[ -z "$pr" ]] && continue
  if [[ ! "$pr" =~ ^[1-9][0-9]*$ ]]; then
    echo "Skipping service with unexpected pr label '${pr}'"
    continue
  fi
  state="$(gh api "repos/${repo}/pulls/${pr}" --jq .state 2>/dev/null || echo missing)"
  idle_days=0
  [[ "$deployed" =~ ^[0-9]+$ ]] && idle_days=$(((now - deployed) / 86400))
  echo "#${pr}: PR ${state}, last deploy ${idle_days} day(s) ago"

  if [[ "$state" != open ]]; then
    teardown "$pr" "Deleted by the nightly clean-up because the PR is ${state}."
  elif ((idle_days >= delete_days)); then
    teardown "$pr" "Deleted by the nightly clean-up after ${idle_days} days without a push. Push to this PR to get a fresh preview."
  elif ((idle_days >= warn_days)); then
    # One reminder per deploy: the marker carries the deploy time.
    marker="<!-- effekt-preview-idle-warning:${deployed} -->"
    already="$(gh api "repos/${repo}/issues/${pr}/comments" --paginate \
      --jq "[.[] | select(.body | startswith(\"${marker}\"))] | length" | awk '{s+=$1} END {print s+0}')"
    if ((already == 0)); then
      body="${marker}
This PR's preview has had no push for ${idle_days} days. It will be deleted after ${delete_days} days without one (in $((delete_days - idle_days)) day(s)). Push to keep it, or close the PR if it's done; previews are limited, so stale ones keep others from getting one."
      act gh api --method POST "repos/${repo}/issues/${pr}/comments" -f "body=${body}" --silent
    fi
  fi
done < <(jq -r '.[] | [.metadata.labels.pr // "", .metadata.labels["deployed-at"] // ""] | @tsv' <<<"$services")

# Seed jobs left behind (e.g. a deploy that failed before creating its service)
service_prs="$(jq -r '.[].metadata.labels.pr // empty' <<<"$services")"
jobs="$(gcloud run jobs list "${R[@]}" --filter "metadata.labels.preview=true" \
  --format 'value(metadata.labels.pr)')"
for pr in $jobs; do
  [[ "$pr" =~ ^[1-9][0-9]*$ ]] || continue
  if ! grep -qx "$pr" <<<"$service_prs"; then
    state="$(gh api "repos/${repo}/pulls/${pr}" --jq .state 2>/dev/null || echo missing)"
    if [[ "$state" != open ]]; then
      echo "#${pr}: leftover seed job, PR ${state}"
      act "${SCRIPT_DIR}/teardown.sh" "$pr"
    fi
  fi
done
echo "Done."
