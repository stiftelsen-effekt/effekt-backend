#!/usr/bin/env sh
# Prints an access token from the local mock OIDC issuer (compose.dev.yml `auth` service).
#
#   scripts/dev-token.sh               admin token (all permissions)
#   scripts/dev-token.sh --donor 27    donor token for donor 27 (non-admin, user-id claim = 27)
#
#   curl -H "Authorization: Bearer $(pnpm -s dev:token)" localhost:5050/...
#   pnpm -s dev:token -- --donor 27
#
# The API discovers the issuer as http://auth:8080/effekt (inside docker), and the mock server
# derives `iss` from the Host header, so requests from the host send "Host: auth:8080".
set -eu

AUTH_URL="http://localhost:${DEV_AUTH_PORT:-8090}/effekt"
ISSUER_HOST="auth:8080"
DONOR_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --donor)
      DONOR_ID="${2:-}"
      shift 2 || true
      ;;
    --donor=*)
      DONOR_ID="${1#--donor=}"
      shift
      ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

extract_token() {
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const t = JSON.parse(s).access_token;
        if (!t) throw new Error();
        process.stdout.write(t + "\n");
      } catch {
        process.stderr.write("No access_token in response from local issuer:\n" + s + "\n");
        process.exit(1);
      }
    });
  '
}

if ! curl -sf -o /dev/null "$AUTH_URL/.well-known/openid-configuration"; then
  echo "Local issuer not reachable at $AUTH_URL. Run: pnpm dev:env:up" >&2
  exit 1
fi

if [ -z "$DONOR_ID" ]; then
  curl -sf "$AUTH_URL/token" -H "Host: $ISSUER_HOST" \
    -d grant_type=client_credentials \
    -d client_id=local-admin \
    -d client_secret=local \
    -d scope=admin | extract_token
  exit 0
fi

case "$DONOR_ID" in
  '' | *[!0-9]*)
    echo "--donor needs a numeric donor id" >&2
    exit 2
    ;;
esac

# Donor tokens go through the authorization_code flow so the user-id claim can be a JSON
# number (the API compares it with === against numeric donor ids).
REDIRECT_URI="http://localhost/callback"
LOCATION=$(curl -s -o /dev/null -w '%{redirect_url}' \
  "$AUTH_URL/authorize?client_id=local-donor&response_type=code&scope=openid&state=dev&nonce=dev&redirect_uri=$REDIRECT_URI" \
  -H "Host: $ISSUER_HOST" \
  --data-urlencode "username=donor-$DONOR_ID" \
  --data-urlencode "claims={\"https://gieffektivt.no/user-id\": $DONOR_ID}")
CODE=$(printf '%s' "$LOCATION" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
if [ -z "$CODE" ]; then
  echo "Login against local issuer failed (redirect: $LOCATION)" >&2
  exit 1
fi

curl -sf "$AUTH_URL/token" -H "Host: $ISSUER_HOST" \
  -d grant_type=authorization_code \
  -d "code=$CODE" \
  -d "redirect_uri=$REDIRECT_URI" \
  -d client_id=local-donor \
  -d client_secret=local | extract_token
