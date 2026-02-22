#!/bin/bash
set -e
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
PROJECT=br-ventasbrasil-cld-01
SA="firebase-deploy-sa@br-ventasbrasil-cld-01.iam.gserviceaccount.com"

echo "▶ Granting IAM roles to $SA..."
for role in \
  roles/firebasehosting.admin \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/storage.admin \
  roles/bigquery.dataEditor \
  roles/bigquery.jobUser \
  roles/aiplatform.user; do
    gcloud projects add-iam-policy-binding $PROJECT \
      --member="serviceAccount:$SA" \
      --role="$role" \
      --condition=None \
      --quiet 2>&1 | tail -1
    echo "  ✓ $role"
done

echo ""
echo "▶ Setting up Artifact Registry..."
gcloud artifacts repositories describe edtechia \
  --location=us-central1 --project=$PROJECT 2>/dev/null || \
gcloud artifacts repositories create edtechia \
  --repository-format=docker \
  --location=us-central1 \
  --project=$PROJECT \
  --description="EdTechia images"
echo "  ✓ Artifact Registry ready"

echo ""
echo "✅ All done. Ready to deploy."
