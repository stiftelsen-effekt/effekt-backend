#!/usr/bin/env bash
# Decides whether pull request <pr> may have a preview (cap: PREVIEW_MAX, default 5).
#
#   capacity.sh <pr> <note-file>
#
# A PR that already has a preview always may (it is replaced). Otherwise a new one is allowed
# while fewer than PREVIEW_MAX previews exist. When refused, <note-file> gets a table of the
# existing previews for the PR comment. No automatic eviction.
# Prints allowed=true|false (and appends it to $GITHUB_OUTPUT when set).
# Env: GH_TOKEN, GITHUB_REPOSITORY, PREVIEW_MAX.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

pr="${1:-}"
note_file="${2:?note file}"
preview_require_pr "$pr"
max="${PREVIEW_MAX:-5}"
[[ "$max" =~ ^[0-9]+$ ]] || max=5
repo="${GITHUB_REPOSITORY:-$PREVIEW_GITHUB_REPO}"

services="$(gcloud run services list --project "$PREVIEW_PROJECT" --region "$PREVIEW_REGION" \
  --filter "metadata.labels.preview=true AND metadata.name ~ ^${PREVIEW_SERVICE_PREFIX}" \
  --format json)"

count="$(jq 'length' <<<"$services")"
mine="$(jq --arg pr "$pr" '[.[] | select(.metadata.labels.pr == $pr)] | length' <<<"$services")"

allowed=false
if ((mine > 0)); then
  allowed=true
  echo "PR #${pr} already has a preview; it is replaced."
elif ((count < max)); then
  allowed=true
  echo "${count} of ${max} previews in use; creating one for #${pr}."
else
  echo "${count} of ${max} previews in use; not creating one for #${pr}."
  now="$(date -u +%s)"
  {
    echo "All **${max}** preview slots are taken, so this PR has no preview yet. Previews are not evicted automatically: please close or finish a stale PR below, then push to this PR (or re-run its *Preview* workflow)."
    echo
    echo "| PR | Title | Age | Last deploy |"
    echo "|---|---|---|---|"
    jq -r '.[] | [.metadata.labels.pr,
        ((.metadata.creationTimestamp // "") | sub("\\.[0-9]+"; "") | (try fromdateiso8601 catch "")),
        (.metadata.labels["deployed-at"] // "")] | @tsv' <<<"$services" |
      sort -n | while IFS=$'\t' read -r other created deployed; do
      title="$(gh api "repos/${repo}/pulls/${other}" --jq .title 2>/dev/null || echo "?")"
      title="${title//|/\\|}"
      if [[ "$created" =~ ^[0-9]+$ ]]; then
        age="$(((now - created) / 86400)) days"
      else
        age="unknown"
      fi
      if [[ "$deployed" =~ ^[0-9]+$ ]]; then
        last="$(((now - deployed) / 86400)) days ago"
      else
        last="unknown"
      fi
      echo "| #${other} | ${title} | ${age} | ${last} |"
    done
  } >"$note_file"
fi

echo "allowed=${allowed}"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "allowed=${allowed}" >>"$GITHUB_OUTPUT"; fi
