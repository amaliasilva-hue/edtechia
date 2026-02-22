#!/usr/bin/env bash
# Creates Google OAuth client programmatically via IAP API (works for internal Workspace apps)
set -euo pipefail
export PATH="$PATH:$HOME/google-cloud-sdk/bin"

PROJECT="br-ventasbrasil-cld-01"
APP_NAME="EdTechia GCP Cert"
SUPPORT_EMAIL="amalia.silva@xertica.com"

TOKEN=$(gcloud auth print-access-token)

echo "▶ [1/3] Enabling oauth2 API..."
gcloud services enable oauth2.googleapis.com iap.googleapis.com --project="$PROJECT" --quiet 2>/dev/null || true

echo "▶ [2/3] Creating OAuth brand (consent screen)..."
BRAND_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://iap.googleapis.com/v1/projects/${PROJECT}/brands" \
  -d "{\"applicationTitle\": \"${APP_NAME}\", \"supportEmail\": \"${SUPPORT_EMAIL}\"}")

echo "Brand response: $BRAND_RESPONSE"
BRAND_NAME=$(echo "$BRAND_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null || echo "")

# If brand already exists, get it
if [[ -z "$BRAND_NAME" ]]; then
  BRAND_NAME=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "https://iap.googleapis.com/v1/projects/${PROJECT}/brands" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('brands',[{}])[0].get('name',''))" 2>/dev/null || echo "")
fi

echo "Brand: $BRAND_NAME"

if [[ -z "$BRAND_NAME" ]]; then
  echo "❌ Could not create or find brand. Create OAuth credentials manually at:"
  echo "   https://console.cloud.google.com/apis/credentials?project=${PROJECT}"
  exit 1
fi

echo "▶ [3/3] Creating OAuth client..."
CLIENT_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://iap.googleapis.com/v1/${BRAND_NAME}/identityAwareProxyClients" \
  -d "{\"displayName\": \"${APP_NAME}\"}")

echo "Client response: $CLIENT_RESPONSE"

CLIENT_ID=$(echo "$CLIENT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','').split('/')[-1])" 2>/dev/null || echo "")
CLIENT_SECRET=$(echo "$CLIENT_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('secret',''))" 2>/dev/null || echo "")

if [[ -n "$CLIENT_ID" && -n "$CLIENT_SECRET" ]]; then
  echo ""
  echo "✅ OAuth client created!"
  echo "   Client ID    : $CLIENT_ID"
  echo "   Client Secret: $CLIENT_SECRET"

  # Patch .env.local
  sed -i "s|GOOGLE_CLIENT_ID=FILL_ME|GOOGLE_CLIENT_ID=${CLIENT_ID}|" /workspaces/edtechia/.env.local
  sed -i "s|GOOGLE_CLIENT_SECRET=FILL_ME|GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}|" /workspaces/edtechia/.env.local
  echo "✅ .env.local updated with OAuth credentials"
else
  echo "❌ IAP OAuth API did not return credentials."
  echo "   Create manually: https://console.cloud.google.com/apis/credentials?project=${PROJECT}"
  echo "   Type: Web application"
  echo "   Authorized redirect URIs:"
  echo "     https://gcp-cert.web.app/api/auth/callback/google"
  echo "     http://localhost:3000/api/auth/callback/google"
fi
