#!/usr/bin/env bash
# EdTechia — Cloud Run Deploy
set -euo pipefail
export PATH="$PATH:$HOME/google-cloud-sdk/bin"

PROJECT="br-ventasbrasil-cld-01"
REGION="us-central1"
SERVICE="edtechia"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/edtechia/app:latest"
ENV_YAML="/tmp/edtechia-env.yaml"

echo "=== [1/6] Docker auth ==="
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "OK"

echo "=== [2/6] Artifact Registry ==="
gcloud artifacts repositories describe edtechia \
  --location="$REGION" --project="$PROJECT" > /dev/null 2>&1 \
  && echo "exists" \
  || gcloud artifacts repositories create edtechia \
    --repository-format=docker --location="$REGION" \
    --project="$PROJECT" --description="EdTechia images" --quiet

echo "=== [3/6] Docker build (linux/amd64) ==="
cd /workspaces/edtechia
docker build --platform linux/amd64 -t "$IMAGE" -f Dockerfile .
echo "Build OK"

echo "=== [4/6] Docker push ==="
docker push "$IMAGE"
echo "Push OK"

echo "=== [5/6] Generate env YAML ==="
python3 /workspaces/edtechia/infra/gen_env_yaml.py
echo "Env YAML ready"

echo "=== [6/6] Cloud Run deploy ==="
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --project="$PROJECT" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi --cpu=2 \
  --min-instances=0 --max-instances=10 \
  --port=3000 --timeout=120 --concurrency=80 \
  --service-account="edtechia-app@${PROJECT}.iam.gserviceaccount.com" \
  --env-vars-file="$ENV_YAML" \
  --quiet

URL="https://${SERVICE}-341913680813.us-central1.run.app"

gcloud run services update "$SERVICE" \
  --region="$REGION" --project="$PROJECT" \
  --update-env-vars="NEXTAUTH_URL=${URL}" --quiet

echo ""
echo "========================================="
echo "DEPLOYED: $URL"
echo "========================================="
echo ""
echo "PENDING — Set Google OAuth credentials:"
echo "  1. Open: https://console.cloud.google.com/apis/credentials/oauthclient?project=br-ventasbrasil-cld-01"
echo "  2. Type: Web application | Name: EdTechia"
echo "  3. Redirect URIs: ${URL}/api/auth/callback/google"
echo "     and: http://localhost:3000/api/auth/callback/google"
echo ""
echo "  4. Then run:"
echo "     gcloud run services update ${SERVICE} --region=${REGION} \\"
echo "       --update-env-vars=GOOGLE_CLIENT_ID=<ID>,GOOGLE_CLIENT_SECRET=<SECRET>"
