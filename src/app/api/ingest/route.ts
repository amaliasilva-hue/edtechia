// =============================================================================
// EdTechia — POST /api/ingest
// Pipeline:
//   1. Receive multipart/form-data (PDF + exam_name)
//   2. Upload original PDF to GCS for archival
//   3. Extract text via MuPDF → Vision OCR fallback (pdfExtractor.ts)
//   4. Chunk text with LangChain RecursiveCharacterTextSplitter
//   5. INSERT chunks into BigQuery exam_documents, calling ML.GENERATE_EMBEDDING
//      inline so embeddings are created server-side in BigQuery (zero extra hop)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { uploadToGCS } from '@/lib/storage';
import { extractTextFromPDF } from '@/lib/pdfExtractor';
import { getBigQueryClient, BQ_TABLES } from '@/lib/bigquery';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { v4 as uuidv4 } from 'uuid';

// Chunk config — 1000 chars with 200 overlap for exam guide PDFs
const CHUNK_SIZE    = 1000;
const CHUNK_OVERLAP = 200;

export const runtime = 'nodejs'; // Required for mupdf native bindings

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse multipart form ──────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file     = formData.get('file') as File | null;
  const examName = (formData.get('exam_name') as string | null)?.trim();

  if (!file || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'A PDF file is required (field: file)' }, { status: 400 });
  }
  if (!examName) {
    return NextResponse.json({ error: 'exam_name is required' }, { status: 400 });
  }

  // ── Read file into Buffer ─────────────────────────────────────────────────
  const pdfBuffer = Buffer.from(await file.arrayBuffer());
  const timestamp = Date.now();
  const gcsPath   = `${examName}/${timestamp}-${file.name}`;

  // ── Step 1: Upload to GCS ─────────────────────────────────────────────────
  let gcsUri: string;
  try {
    gcsUri = await uploadToGCS(pdfBuffer, gcsPath);
    console.log(`[ingest] Uploaded to GCS: ${gcsUri}`);
  } catch (err) {
    console.error('[ingest] GCS upload failed:', err);
    return NextResponse.json({ error: 'Failed to upload PDF to GCS' }, { status: 500 });
  }

  // ── Step 2: Extract text ──────────────────────────────────────────────────
  let extractionResult: Awaited<ReturnType<typeof extractTextFromPDF>>;
  try {
    extractionResult = await extractTextFromPDF(pdfBuffer);
    console.log(`[ingest] Extracted ${extractionResult.text.length} chars via ${extractionResult.method}`);
  } catch (err) {
    console.error('[ingest] Text extraction failed:', err);
    return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 500 });
  }

  if (!extractionResult.text.trim()) {
    return NextResponse.json({ error: 'No text could be extracted from this PDF' }, { status: 422 });
  }

  // ── Step 3: Chunk text ────────────────────────────────────────────────────
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const chunks = await splitter.splitText(extractionResult.text);
  console.log(`[ingest] Created ${chunks.length} chunks`);

  // ── Step 4: INSERT into BigQuery with inline ML.GENERATE_EMBEDDING ─────────
  // We use BigQuery DML with ML.GENERATE_EMBEDDING so embeddings are computed
  // server-side inside BigQuery — no need to call the embedding API from Node.
  //
  // The query inserts one row per chunk using UNNEST over a temporary array.
  // This is batched into groups of 50 to stay within BigQuery DML limits.

  const bq         = getBigQueryClient();
  const dataset    = BQ_TABLES.dataset;
  const table      = BQ_TABLES.docs;
  const project    = process.env.GCP_PROJECT_ID!;
  const embedModel = process.env.BQ_EMBEDDING_MODEL ?? `${project}.${dataset}.embedding_model`;

  // Build rows array for BigQuery parameterized insert
  const rows = chunks.map((chunk, index) => ({
    id:               uuidv4(),
    exam_name:        examName,
    source_file:      gcsUri,
    chunk_index:      index,
    content:          chunk,
    extraction_method: extractionResult.method,
  }));

  // We insert in batches, using a INSERT ... SELECT with ML.GENERATE_EMBEDDING
  const BATCH_SIZE = 25; // keep DML under BigQuery limits
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Build a VALUES list with positional params for this batch
    const valuePlaceholders = batch
      .map(
        (_, idx) =>
          `(@id_${idx}, @exam_name_${idx}, @source_${idx}, @chunk_idx_${idx}, @content_${idx}, ` +
          `(SELECT ml_generate_embedding_result FROM ML.GENERATE_EMBEDDING(MODEL \`${embedModel}\`, ` +
          `(SELECT @content_${idx} AS content)) LIMIT 1), ` +
          `@method_${idx}, CURRENT_TIMESTAMP())`
      )
      .join(',\n');

    // Flatten params for this batch
    const params: Record<string, unknown> = {};
    batch.forEach((row, idx) => {
      params[`id_${idx}`]        = row.id;
      params[`exam_name_${idx}`] = row.exam_name;
      params[`source_${idx}`]    = row.source_file;
      params[`chunk_idx_${idx}`] = row.chunk_index;
      params[`content_${idx}`]   = row.content;
      params[`method_${idx}`]    = row.extraction_method;
    });

    const insertQuery = `
      INSERT INTO \`${project}.${dataset}.${table}\`
        (id, exam_name, source_file, chunk_index, content, content_embedding, extraction_method, created_at)
      VALUES
        ${valuePlaceholders}
    `;

    try {
      const [job] = await bq.createQueryJob({
        query: insertQuery,
        useLegacySql: false,
        params,
        location: process.env.BQ_LOCATION ?? 'US',
      });
      await job.getQueryResults();
      insertedCount += batch.length;
      console.log(`[ingest] Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${batch.length} chunks`);
    } catch (err) {
      console.error(`[ingest] BigQuery insert failed for batch starting at ${i}:`, err);
      return NextResponse.json(
        {
          error: 'BigQuery insert failed',
          detail: err instanceof Error ? err.message : String(err),
          chunksInsertedBeforeError: insertedCount,
        },
        { status: 500 }
      );
    }
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    exam_name:         examName,
    gcs_uri:           gcsUri,
    extraction_method: extractionResult.method,
    total_chunks:      chunks.length,
    inserted_chunks:   insertedCount,
  });
}
