// =============================================================================
// EdTechia — PDF Text Extractor
// Pipeline (in order):
//   1. MuPDF  — native text extraction, preserves table structure as Markdown
//   2. Cloud Vision OCR — fallback for scanned/image-only PDFs
//
// The function returns { text, method } so the caller can persist
// `extraction_method` in BigQuery for auditing.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const VISION_OCR_MIN_CHARS = Number(process.env.VISION_OCR_MIN_CHARS ?? 200);

export type ExtractionResult = {
  text: string;
  method: 'mupdf' | 'vision-ocr';
  pageCount?: number;
};

// ---------------------------------------------------------------------------
// PRIMARY: MuPDF
// ---------------------------------------------------------------------------

async function extractWithMuPDF(pdfBuffer: Buffer): Promise<string> {
  // mupdf is a native Node.js binding — we import it dynamically so it only
  // loads in the Node.js server runtime (not in the browser bundle).
  const mupdf = await import('mupdf');

  const doc = mupdf.Document.openDocument(pdfBuffer, 'application/pdf') as any;
  const pageCount: number = doc.countPages();
  const pages: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i) as any;

    // Extract structured text as JSON, then convert tables → Markdown
    const structuredText = page.toStructuredText('preserve-whitespace') as any;
    const plainText: string = structuredText.asText();
    pages.push(plainText);
  }

  return pages.join('\n\n--- PAGE BREAK ---\n\n');
}

// ---------------------------------------------------------------------------
// FALLBACK: Google Cloud Vision OCR
// ---------------------------------------------------------------------------

async function extractWithVisionOCR(pdfBuffer: Buffer): Promise<string> {
  const { ImageAnnotatorClient } = await import('@google-cloud/vision');

  const client = new ImageAnnotatorClient({
    projectId: process.env.GCP_PROJECT_ID!,
    ...(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64
      ? {
          credentials: JSON.parse(
            Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64!, 'base64').toString('utf8')
          ),
        }
      : {}),
  });

  // Vision API document text detection — handles multi-page PDFs as base64
  const [result] = await client.documentTextDetection({
    image: { content: pdfBuffer.toString('base64') },
    imageContext: {
      languageHints: ['en', 'pt'],
    },
  });

  const fullText = result.fullTextAnnotation?.text ?? '';
  return fullText;
}

// ---------------------------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------------------------

/**
 * Extracts text from a PDF buffer using MuPDF first, then Cloud Vision as fallback.
 * Returns `{ text, method }` — `method` is stored in BigQuery for auditing.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<ExtractionResult> {
  let mupdfText = '';

  try {
    mupdfText = await extractWithMuPDF(pdfBuffer);
  } catch (err) {
    console.error('[pdfExtractor] MuPDF failed, will try Vision OCR:', err);
  }

  // If MuPDF extracted enough text (native/digital PDF), use it.
  if (mupdfText.replace(/\s/g, '').length >= VISION_OCR_MIN_CHARS) {
    return { text: mupdfText, method: 'mupdf' };
  }

  // Otherwise fallback to Cloud Vision OCR (scanned PDFs / image-only docs)
  console.warn(
    `[pdfExtractor] MuPDF returned only ${mupdfText.length} chars — activating Cloud Vision OCR fallback.`
  );

  const visionText = await extractWithVisionOCR(pdfBuffer);
  return { text: visionText, method: 'vision-ocr' };
}
