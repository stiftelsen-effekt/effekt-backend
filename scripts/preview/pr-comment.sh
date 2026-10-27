#!/usr/bin/env bash
# Creates or updates the one preview comment on a pull request (found by a hidden marker).
#
#   pr-comment.sh <pr> <status> [--sha SHA] [--url URL] [--seeded-at ISO] [--note-file FILE]
#
# status: building | ready | failed | torn-down | capped
# Env: GH_TOKEN, GITHUB_REPOSITORY; optional GITHUB_SERVER_URL + GITHUB_RUN_ID (run link).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source-path=SCRIPTDIR source=config.sh
source "${SCRIPT_DIR}/config.sh"

pr="${1:-}"
status="${2:-}"
preview_require_pr "$pr"
shift 2

sha="" url="" seeded_at="" note_file=""
while (($# > 0)); do
  case "$1" in
    --sha) sha="$2" ;;
    --url) url="$2" ;;
    --seeded-at) seeded_at="$2" ;;
    --note-file) note_file="$2" ;;
    *)
      echo "Unknown option $1" >&2
      exit 2
      ;;
  esac
  shift 2
done

repo="${GITHUB_REPOSITORY:-$PREVIEW_GITHUB_REPO}"
server="${GITHUB_SERVER_URL:-https://github.com}"
marker="<!-- effekt-preview -->"
now="$(date -u '+%Y-%m-%d %H:%M UTC')"

case "$status" in
  building) status_text="**Building** – deploying this commit and re-seeding the database. The link works again when this says Ready." ;;
  ready) status_text="**Ready**" ;;
  failed) status_text="**Failed** – see the workflow run. The previous deploy (if any) may still answer, with a reset database." ;;
  torn-down) status_text="**Torn down** – the service and its database are deleted." ;;
  capped) status_text="**Not created** – the limit of concurrent previews is reached." ;;
  *)
    echo "Unknown status ${status}" >&2
    exit 2
    ;;
esac

{
  echo "$marker"
  echo "### Preview environment"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| Status | ${status_text} |"
  if [[ -n "$url" && "$status" != torn-down && "$status" != capped ]]; then
    echo "| URL | ${url} |"
  fi
  if [[ -n "$sha" ]]; then
    echo "| Commit | [\`${sha:0:7}\`](${server}/${repo}/commit/${sha}) |"
  fi
  if [[ -n "$seeded_at" ]]; then
    echo "| Data | Synthetic, seeded ${seeded_at} (dates are relative to the seed day) |"
  fi
  run_link=""
  if [[ -n "${GITHUB_RUN_ID:-}" ]]; then
    run_link=" · [workflow run](${server}/${repo}/actions/runs/${GITHUB_RUN_ID})"
  fi
  echo "| Updated | ${now}${run_link} |"
  echo
  if [[ -n "$note_file" && -s "$note_file" ]]; then
    cat "$note_file"
    echo
  fi
  if [[ "$status" == ready || "$status" == building ]]; then
    cat <<'EOF'
<details><summary>How to test</summary>

- Open the URL and pick who you are: **Ops**, **Finance** or **Approver** (all admins, no password). Switch person any time from the *Preview* badge in the bottom-right corner, e.g. to approve a regranting round someone else created.
- Everything is synthetic and nothing leaves the preview: no emails, payments, bank files or syncs.
- Every push to this PR rebuilds the preview and resets its database.
- Ask for changes by commenting `@claude <what to change>` (collaborators with write access). Claude commits to this branch and the preview updates.
- Previews with no push for 14 days get a reminder; after 21 days they are deleted (push again to recreate).
</details>
EOF
  fi
} >"${TMPDIR:-/tmp}/preview-comment-${pr}.md"
body_file="${TMPDIR:-/tmp}/preview-comment-${pr}.md"

comment_id="$(gh api "repos/${repo}/issues/${pr}/comments" --paginate \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"${marker}\"))) | .id" |
  awk 'NR == 1')"

if [[ -n "$comment_id" ]]; then
  gh api --method PATCH "repos/${repo}/issues/comments/${comment_id}" -F "body=@${body_file}" >/dev/null
  echo "Updated preview comment ${comment_id} on #${pr}: ${status}"
else
  gh api --method POST "repos/${repo}/issues/${pr}/comments" -F "body=@${body_file}" >/dev/null
  echo "Created preview comment on #${pr}: ${status}"
fi
