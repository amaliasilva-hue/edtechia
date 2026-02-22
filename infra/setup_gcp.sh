#!/usr/bin/env bash
# =============================================================================
# EdTechia — GCP Infrastructure Setup
# Project: br-ventasbrasil-cld-01
# Run this script once to bootstrap all cloud resources.
# Usage: chmod +x setup_gcp.sh && ./setup_gcp.sh
# =============================================================================

set -euo pipefail

# ─── CONFIG ──────────────────────────────────────────────────────────────────
PROJECT_ID="br-ventasbrasil-cld-01"
REGION="us-central1"
GCS_BUCKET="br-ventasbrasil-cld-01-exam-docs"
BQ_DATASET="edtech_platform"
SA_NAME="edtechia-app"
SA_DISPLAY="EdTechia App Service Account"
KEY_FILE="./edtechia-sa-key.json"

echo "▶ Setting active project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

# ─── 1. ENABLE REQUIRED APIS ─────────────────────────────────────────────────
echo ""
echo "▶ [1/6] Enabling required GCP APIs..."

gcloud services enable \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  bigquerystorage.googleapis.com \
  bigqueryconnection.googleapis.com \
  storage.googleapis.com \
  storage-component.googleapis.com \
  vision.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  --project="$PROJECT_ID"

echo "✓ APIs enabled (Vertex AI, BigQuery, BQ Connections, GCS, Cloud Vision, IAM)."

# ─── 2. CREATE GCS BUCKET ─────────────────────────────────────────────────────
echo ""
echo "▶ [2/6] Creating GCS bucket: gs://$GCS_BUCKET"

# Check if bucket exists first
if gsutil ls -b "gs://$GCS_BUCKET" &>/dev/null; then
  echo "  ⚠ Bucket already exists, skipping."
else
  gcloud storage buckets create "gs://$GCS_BUCKET" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
  echo "✓ Bucket created: gs://$GCS_BUCKET"
fi

# ─── 3. CREATE BIGQUERY DATASET ───────────────────────────────────────────────
echo ""
echo "▶ [3/6] Creating BigQuery dataset: $BQ_DATASET"

bq --location="$REGION" mk \
  --dataset \
  --description="EdTechia platform data" \
  "$PROJECT_ID:$BQ_DATASET" \
  2>/dev/null || echo "  ⚠ Dataset already exists, skipping."

echo "✓ Dataset ready: $PROJECT_ID:$BQ_DATASET"

# ─── 4. CREATE SERVICE ACCOUNT ───────────────────────────────────────────────
echo ""
echo "▶ [4/6] Creating service account: $SA_NAME"

if gcloud iam service-accounts describe "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" &>/dev/null; then
  echo "  ⚠ Service account already exists, skipping creation."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="$SA_DISPLAY" \
    --project="$PROJECT_ID"
  echo "✓ Service account created."
fi

SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Grant required roles
echo "  → Granting BigQuery roles..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/bigquery.dataEditor" \
  --condition=None

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/bigquery.jobUser" \
  --condition=None

echo "  → Granting Storage roles..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin" \
  --condition=None

echo "  → Granting Vertex AI roles..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user" \
  --condition=None

echo "  → Granting Cloud Vision roles..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/visionai.admin" \
  --condition=None

echo "✓ IAM roles granted."

# Generate JSON key file
echo "  → Generating key file: $KEY_FILE"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"
echo "✓ Key saved to: $KEY_FILE"
echo "  ⚠  DO NOT commit this file. It is already in .gitignore."

# ─── 5. RUN BIGQUERY DDL SCHEMA ───────────────────────────────────────────────
echo ""
echo "▶ [5/6] Creating BigQuery Cloud Resource Connection (required for ML.GENERATE_EMBEDDING)..."

BQ_CONN_NAME="vertex_conn"
BQ_CONN_LOCATION="US"

# Create the connection (idempotent — will fail silently if it already exists)
bq mk \
  --connection \
  --location="$BQ_CONN_LOCATION" \
  --project_id="$PROJECT_ID" \
  --connection_type=CLOUD_RESOURCE \
  "$BQ_CONN_NAME" 2>/dev/null || echo "  ⚠ Connection already exists, skipping."

# Retrieve the auto-generated service account for the connection
CONN_SA=$(bq show \
  --connection "$PROJECT_ID.$BQ_CONN_LOCATION.$BQ_CONN_NAME" \
  --format=json 2>/dev/null | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['cloudResource']['serviceAccountId'])" \
  2>/dev/null || echo "")

if [[ -n "$CONN_SA" ]]; then
  echo "  → Connection SA: $CONN_SA"
  echo "  → Granting Vertex AI User role to connection SA..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$CONN_SA" \
    --role="roles/aiplatform.user" \
    --condition=None
  echo "✓ BigQuery Cloud Resource Connection ready."
else
  echo "  ⚠ Could not retrieve connection SA. Grant manually:"
  echo "    SA=\$(bq show --connection $PROJECT_ID.$BQ_CONN_LOCATION.$BQ_CONN_NAME --format=json | jq -r '.cloudResource.serviceAccountId')"
  echo "    gcloud projects add-iam-policy-binding $PROJECT_ID --member=\"serviceAccount:\$SA\" --role=roles/aiplatform.user"
fi

# ─── 6. RUN BIGQUERY DDL SCHEMA ───────────────────────────────────────────────
echo ""
echo "▶ [6/6] Applying BigQuery schema..."

bq query \
  --use_legacy_sql=false \
  --project_id="$PROJECT_ID" \
  < "$(dirname "$0")/schema.sql"

echo "✓ Schema applied."

# ─── DONE ─────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅  EdTechia GCP setup complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Copy the service account key to your app:"
echo "     cp $KEY_FILE ../edtechia-sa-key.json"
echo ""
echo "  2. Set up Google OAuth 2.0 credentials:"
echo "     https://console.cloud.google.com/apis/credentials"
echo "     • Application type: Web application"
echo "     • Authorized redirect URIs:"
echo "       - http://localhost:3000/api/auth/callback/google"
echo "       - https://YOUR_DOMAIN/api/auth/callback/google"
echo ""
echo "  3. Copy .env.example to .env.local and fill in the values:"
echo "     cp ../.env.example ../.env.local"
echo ""
echo "  4. Verify BQ Remote Embedding Model was created:"
echo "     bq show $PROJECT_ID:$BQ_DATASET.embedding_model"
echo ""
echo "  5. (First ingest only) If Vision OCR fallback is needed, ensure"
echo "     Cloud Vision API is enabled and the SA key has vision perms."
echo ""
