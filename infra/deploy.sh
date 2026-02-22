#!/usr/bin/env bash
# =============================================================================
# EdTechia — Full Deploy: Cloud Run (backend) + Firebase Hosting (CDN proxy)
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-br-ventasbrasil-cld-01}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="edtechia"
REPO_NAME="edtechia"
IMAGE_TAG="latest"
MIN_INSTANCES=1
MAX_INSTANCES=10
MEMORY="2Gi"
CPU="2"
PORT=3000

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/app"
IMAGE="${REGISTRY}:${IMAGE_TAG}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          EdTechia — Cloud Run + Firebase Deploy              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Project  : ${PROJECT_ID}"
echo "║  Region   : ${REGION}"
echo "║  Service  : ${SERVICE_NAME}"
echo "║  Image    : ${IMAGE}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Ensure Artifact Registry repo exists ──────────────────────────
echo "▶ [1/5] Ensuring Artifact Registry repo '${REPO_NAME}' exists..."
gcloud artifacts repositories describe "${REPO_NAME}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" > /dev/null 2>&1 || \
gcloud artifacts repositories create "${REPO_NAME}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --description="EdTechia container images"

# ── Step 2: Configure Docker auth ────────────────────────────────────────
echo "▶ [2/5] Configuring Docker auth for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Step 3: Build and push Docker image ──────────────────────────────────
echo "▶ [3/5] Building Docker image..."
cd "$(dirname "$0")/.."

docker build \
  --platform linux/amd64 \
  --tag "${IMAGE}" \
  --file Dockerfile \
  .

echo "▶ [3/5] Pushing image to Artifact Registry..."
docker push "${IMAGE}"

# ── Step 4: Deploy to Cloud Run ───────────────────────────────────────────
echo "▶ [4/5] Deploying to Cloud Run..."

# Load env vars from .env.local if present (excludes comments and blanks)
ENV_VARS=""
if [[ -f ".env.local" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^#.*$ ]] && continue
    [[ -z "$line" ]] && continue
    # Skip NEXTAUTH_URL — we'll set it from Cloud Run URL
    [[ "$line" =~ ^NEXTAUTH_URL= ]] && continue
    ENV_VARS="${ENV_VARS},${line}"
  done < ".env.local"
  ENV_VARS="${ENV_VARS#,}"  # strip leading comma
fi

# Deploy
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory="${MEMORY}" \
  --cpu="${CPU}" \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --port="${PORT}" \
  --timeout=60 \
  --concurrency=80 \
  --set-env-vars="NODE_ENV=production${ENV_VARS:+,${ENV_VARS}}" \
  --quiet

# Get the Cloud Run URL
CLOUD_RUN_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo ""
echo "  ✅ Cloud Run deployed at: ${CLOUD_RUN_URL}"
echo ""

# Update NEXTAUTH_URL on the Cloud Run service
echo "▶ [4/5] Updating NEXTAUTH_URL to ${CLOUD_RUN_URL}..."
gcloud run services update "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --update-env-vars="NEXTAUTH_URL=${CLOUD_RUN_URL}" \
  --quiet

# ── Step 5: Deploy Firebase Hosting ──────────────────────────────────────
echo "▶ [5/5] Deploying Firebase Hosting (site: gcp-cert → Cloud Run proxy)..."

# Check firebase-tools is installed
if ! command -v firebase &> /dev/null; then
  echo "  Installing firebase-tools..."
  npm install -g firebase-tools --quiet
fi

firebase deploy --only hosting:gcp-cert \
  --project="${PROJECT_ID}" \
  --non-interactive

FIREBASE_URL="https://gcp-cert.web.app"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                   DEPLOY COMPLETE ✅                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Cloud Run :  ${CLOUD_RUN_URL}"
echo "║  Firebase  :  ${FIREBASE_URL}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next: Set NEXTAUTH_URL=${FIREBASE_URL} if using Firebase domain as primary:"
echo "  gcloud run services update ${SERVICE_NAME} \\"
echo "    --region=${REGION} \\"
echo "    --update-env-vars=NEXTAUTH_URL=${FIREBASE_URL}"
echo ""
