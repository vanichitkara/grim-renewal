#!/usr/bin/env bash
# Deploy the Grim Renewal shared-tips server to Google Cloud Run, with Firestore for storage.
#
# Run it from the project root, in YOUR terminal (it needs your Google sign-in):
#   bash scripts/deploy-tips-gcp.sh <project-id> [region]
# Example:
#   bash scripts/deploy-tips-gcp.sh grim-renewal-123456 us-central1
#
# What it does, in order (each step is safe to re-run):
#   1. checks the gcloud tool and your sign-in, and that the project exists
#   2. turns on Cloud Run, Cloud Build, Artifact Registry and Firestore (only these)
#   3. creates the Firestore database in Native mode if there is none
#   4. creates two service accounts: one that may only read and write Firestore (runs the server),
#      and one that may only build it (Cloud Run Builder), so the build never relies on the default account
#   5. builds the container from ./Dockerfile and deploys it (public https address, small limits)
#   6. checks /health from the address it got, and checks a foreign website is refused
#   7. prints the address and the two commands to put it on the live site
#
# It never uploads .env, node_modules, the site or git history (see .gcloudignore).
# Costs: Cloud Run and Firestore have free tiers; this script caps the service at 2 instances and 0 when idle.
# Check current prices for your account before you rely on that: https://cloud.google.com/run/pricing
#
# Undo: gcloud run services delete grim-tips --region <region> --project <project-id>
#       (the Firestore data stays until you delete the database in the console)

set -euo pipefail

PROJECT="${1:-}"
REGION="${2:-us-central1}"
SERVICE="grim-tips"
SA_NAME="grim-tips-runner"
BUILD_SA_NAME="grim-tips-builder"
ORIGINS="${GRIM_CORS_ORIGINS:-https://vanichitkara.github.io}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$PROJECT" ] || fail "Give the project id. Example: bash scripts/deploy-tips-gcp.sh my-project-id us-central1"
[ -f Dockerfile ] && [ -f server/community-api.ts ] && [ -f .gcloudignore ] || fail "Run this from the Grim Renewal project root."
case "$ORIGINS" in *'*'*) fail "GRIM_CORS_ORIGINS must list exact sites, never *." ;; esac

say "1/7 Checking gcloud and your sign-in"
if ! gcloud --version >/dev/null 2>&1; then
  fail "gcloud does not start. If it complains about Python, run: brew reinstall --cask gcloud-cli  (or set CLOUDSDK_PYTHON to a Python 3.10-3.14), then try again."
fi
ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1)"
[ -n "$ACCOUNT" ] || fail "You are not signed in. Run: gcloud auth login   then run this script again."
echo "Signed in as: $ACCOUNT"
gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1 \
  || fail "Project '$PROJECT' was not found, or this account cannot see it. List yours with: gcloud projects list"
BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
if [ "$BILLING" != "True" ]; then
  fail "Billing is not on for '$PROJECT'. Cloud Run needs a billing account linked, even inside the free tier. Link one in the console (Billing), then run this again."
fi
echo "Project: $PROJECT   Region: $REGION   Allowed site(s): $ORIGINS"

say "2/7 Turning on the services this needs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com \
  --project "$PROJECT"

say "3/7 Firestore database (Native mode)"
if gcloud firestore databases describe --database='(default)' --project "$PROJECT" >/dev/null 2>&1; then
  TYPE="$(gcloud firestore databases describe --database='(default)' --project "$PROJECT" --format='value(type)')"
  echo "A Firestore database already exists (type: $TYPE)."
  [ "$TYPE" = "FIRESTORE_NATIVE" ] || fail "The existing database is in '$TYPE' mode. This server needs Native mode. Use another project, or ask before changing it."
else
  gcloud firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --project "$PROJECT"
fi

say "4/7 Service accounts: one to run (Firestore only), one to build (Cloud Run Builder only)"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="Grim Renewal tips server" --project "$PROJECT"
fi
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/datastore.user" --condition=None --quiet >/dev/null
echo "$SA_EMAIL may read and write Firestore, nothing else."

# Build account. Google's docs: the Cloud Build service account needs roles/run.builder for a --source deploy.
# Using our own account avoids the project's default build account, which may lack permissions (the error you saw).
BUILD_SA_EMAIL="${BUILD_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$BUILD_SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$BUILD_SA_NAME" --display-name="Grim Renewal tips builder" --project "$PROJECT"
fi
for ROLE in roles/run.builder roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${BUILD_SA_EMAIL}" --role="$ROLE" --condition=None --quiet >/dev/null
done
echo "$BUILD_SA_EMAIL may build this service, nothing else."

say "5/7 Building and deploying (a few minutes the first time)"
deploy() {
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --build-service-account "projects/${PROJECT}/serviceAccounts/${BUILD_SA_EMAIL}" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --ingress all \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 40 \
  --cpu 1 \
  --memory 256Mi \
  --timeout 15 \
  --set-env-vars "^@^STORE=firestore@FIRESTORE_COLLECTION=tips@TRUST_PROXY=1@HOST=0.0.0.0@GRIM_CORS_ORIGINS=${ORIGINS}" \
  --quiet
}

LOG="$(mktemp)"
deployed=""
for TRY in 1 2 3 4; do
  if deploy 2>&1 | tee "$LOG"; then
    # gcloud's exit code is the pipeline's first command only with pipefail, which is on
    deployed=1; break
  fi
  if grep -q "PERMISSION_DENIED" "$LOG" && [ "$TRY" -lt 4 ]; then
    echo "  New permissions can take a few minutes to spread. Waiting 60 s, then trying again ($TRY of 3)..."
    sleep 60
  else
    break
  fi
done
rm -f "$LOG"
[ -n "$deployed" ] || fail "Deploy failed. If it still says PERMISSION_DENIED, wait 5 minutes and run this script again (it is safe to re-run)."

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
[ -n "$URL" ] || fail "Deployed, but could not read the service address."
case "$URL" in https://*) ;; *) fail "The address is not https: $URL" ;; esac

say "6/7 Checking the live server"
FIRST_ORIGIN="${ORIGINS%%,*}"
ok=""
for i in 1 2 3 4 5 6; do
  BODY="$(curl -s --max-time 20 -H "Origin: ${FIRST_ORIGIN}" "${URL}/health" || true)"
  if [ "$BODY" = '{"ok":true}' ]; then ok=1; break; fi
  echo "  not ready yet (try $i), waiting..."; sleep 5
done
[ -n "$ok" ] || fail "/health did not answer {\"ok\":true}. Read the logs: gcloud run services logs read $SERVICE --region $REGION --project $PROJECT"
echo "  /health answers from ${FIRST_ORIGIN}: ok"
ALLOW="$(curl -s --max-time 20 -o /dev/null -D - -H "Origin: ${FIRST_ORIGIN}" "${URL}/tips/all" | tr -d '\r' | grep -i '^access-control-allow-origin:' | cut -d' ' -f2- || true)"
[ "$ALLOW" = "$FIRST_ORIGIN" ] || fail "CORS header for ${FIRST_ORIGIN} is '${ALLOW}', expected the site itself."
echo "  /tips/all allows ${FIRST_ORIGIN} only: ok"
EVIL="$(curl -s --max-time 20 -o /dev/null -w '%{http_code}' -H 'Origin: https://evil.example' "${URL}/health" || true)"
[ "$EVIL" = "403" ] || fail "Another website got ${EVIL}, expected 403."
echo "  another website is refused (403): ok"

say "7/7 Done"
cat <<EOF

Tips server is live at:
  ${URL}

Put it on the live site (the address is public, not a secret):
  gh variable set GRIM_COMMUNITY_URL --repo vanichitkara/grim-renewal --body "${URL}"
  gh workflow run pages.yml --repo vanichitkara/grim-renewal --ref main

Or for your own machine, add this line to .env and restart npm run dev:
  GRIM_COMMUNITY_URL=${URL}

The live site only uses it once the build-wave code is on main (it is on branch feature/build-wave now).
Undo: gcloud run services delete ${SERVICE} --region ${REGION} --project ${PROJECT}
EOF
