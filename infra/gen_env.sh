#!/usr/bin/env bash
set -euo pipefail
export PATH="$PATH:$HOME/google-cloud-sdk/bin"

NEXTAUTH_SECRET=$(openssl rand -base64 32)
SA_KEY_B64=$(base64 -w 0 /workspaces/edtechia/edtechia-sa-key.json)

cat > /workspaces/edtechia/.env.local <<ENVEOF
# AUTO-GENERATED — do NOT commit
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=FILL_ME
GOOGLE_CLIENT_SECRET=FILL_ME
GCP_PROJECT_ID=br-ventasbrasil-cld-01
GCP_REGION=us-central1
GCP_SERVICE_ACCOUNT_KEY_BASE64=${SA_KEY_B64}
BQ_DATASET=edtech_platform
BQ_TABLE_DOCS=exam_documents
BQ_TABLE_SESSIONS=exam_sessions
BQ_TABLE_HISTORY=question_history
BQ_LOCATION=US
GCS_BUCKET=br-ventasbrasil-cld-01-exam-docs
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL_PRIMARY=gemini-2.5-pro
VERTEX_AI_MODEL_FALLBACK_1=gemini-2.0-flash
VERTEX_AI_MODEL_FALLBACK_2=gemini-1.5-pro-002
VERTEX_AI_MODEL_FALLBACK_3=gemini-1.5-flash-002
VERTEX_EMBEDDING_MODEL=text-embedding-004
BQ_EMBEDDING_MODEL=br-ventasbrasil-cld-01.edtech_platform.embedding_model
BQ_VERTEX_CONNECTION=br-ventasbrasil-cld-01.us.vertex_conn
VISION_OCR_MIN_CHARS=200
ENVEOF

echo "✅ .env.local OK"
echo "NEXTAUTH_SECRET set: YES"
echo "SA key base64 length: $(echo $SA_KEY_B64 | wc -c)"
