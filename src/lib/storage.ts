// =============================================================================
// EdTechia — Google Cloud Storage Client
// Handles uploads and downloads from gs://br-ventasbrasil-cld-01-exam-docs
// =============================================================================

import { Storage } from '@google-cloud/storage';

let _storage: Storage | null = null;

export function getStorageClient(): Storage {
  if (!_storage) {
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID!,
      ...(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64
        ? {
            credentials: JSON.parse(
              Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8')
            ),
          }
        : {}),
    });
  }
  return _storage;
}

const BUCKET_NAME = process.env.GCS_BUCKET ?? 'br-ventasbrasil-cld-01-exam-docs';

/**
 * Uploads a Buffer to GCS and returns the `gs://` URI.
 * @param buffer   File contents
 * @param destPath Path inside the bucket (e.g. "gcp-pca/guide.pdf")
 * @param mimeType MIME type (default: application/pdf)
 */
export async function uploadToGCS(
  buffer: Buffer,
  destPath: string,
  mimeType = 'application/pdf'
): Promise<string> {
  const storage = getStorageClient();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(destPath);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });

  return `gs://${BUCKET_NAME}/${destPath}`;
}

/**
 * Downloads a file from GCS and returns its Buffer.
 */
export async function downloadFromGCS(gcsUri: string): Promise<Buffer> {
  const path = gcsUri.replace(`gs://${BUCKET_NAME}/`, '');
  const storage = getStorageClient();
  const [contents] = await storage.bucket(BUCKET_NAME).file(path).download();
  return contents as Buffer;
}
