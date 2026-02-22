-- =============================================================================
-- EdTechia — BigQuery Schema (DDL)
-- Dataset: edtech_platform
-- Project: br-ventasbrasil-cld-01
-- Run via: bq query --use_legacy_sql=false < schema.sql
-- =============================================================================

-- ─── TABLE 1: exam_documents ─────────────────────────────────────────────────
-- Stores chunked text from official exam guide PDFs and their vector embeddings.
-- ML.GENERATE_EMBEDDING populates content_embedding at INSERT time.

CREATE TABLE IF NOT EXISTS `br-ventasbrasil-cld-01.edtech_platform.exam_documents`
(
  id                  STRING  NOT NULL  OPTIONS(description="UUID for the chunk"),
  exam_name           STRING  NOT NULL  OPTIONS(description="e.g. GCP-PCA, AWS-SAA"),
  source_file         STRING            OPTIONS(description="GCS URI of the source PDF"),
  chunk_index         INT64             OPTIONS(description="Zero-based chunk position in the document"),
  content             STRING  NOT NULL  OPTIONS(description="Raw text chunk from the PDF, tables preserved as Markdown"),
  content_embedding   ARRAY<FLOAT64>    OPTIONS(description="Vector embedding via ML.GENERATE_EMBEDDING(content)"),
  extraction_method   STRING            OPTIONS(description="mupdf | vision-ocr | gemini-multimodal — which extractor produced the text"),
  created_at          TIMESTAMP         OPTIONS(description="Row insertion timestamp")
)
OPTIONS(
  description="Chunked exam guide documents with vector embeddings for RAG queries"
);

-- ─── TABLE 2: exam_sessions ──────────────────────────────────────────────────
-- Groups a set of questions into a single exam/simulado session.
-- Enables timed simulations (e.g. 50-question mock exam with final score).

CREATE TABLE IF NOT EXISTS `br-ventasbrasil-cld-01.edtech_platform.exam_sessions`
(
  id               STRING     NOT NULL  OPTIONS(description="UUID for the session"),
  user_email       STRING     NOT NULL  OPTIONS(description="User from Google Auth"),
  exam_name        STRING     NOT NULL  OPTIONS(description="Exam being simulated"),
  mode             STRING               OPTIONS(description="practice | simulation | review"),
  started_at       TIMESTAMP  NOT NULL  OPTIONS(description="Session start time"),
  finished_at      TIMESTAMP            OPTIONS(description="Session end time, NULL if in progress"),
  total_questions  INT64                OPTIONS(description="Number of questions in the session"),
  correct_count    INT64                OPTIONS(description="How many were answered correctly"),
  final_score      FLOAT64              OPTIONS(description="correct_count / total_questions * 100"),
  metadata         JSON                 OPTIONS(description="Optional config: difficulty, topics filter, time_limit_secs")
)
PARTITION BY DATE(started_at)
CLUSTER BY user_email, exam_name
OPTIONS(
  description="Exam session groups — enables timed mock exams and per-session analytics",
  require_partition_filter=false
);

-- ─── TABLE 3: question_history ────────────────────────────────────────────────
-- Tracks every question generated and the user's answer for analytics/insights.
-- session_id links to exam_sessions for grouped simulation tracking.
-- user_rating + feedback_notes enable RLHF quality monitoring.

CREATE TABLE IF NOT EXISTS `br-ventasbrasil-cld-01.edtech_platform.question_history`
(
  id                  STRING     NOT NULL  OPTIONS(description="UUID for the event"),
  session_id          STRING               OPTIONS(description="FK → exam_sessions.id — NULL for ad-hoc practice questions"),
  user_email          STRING     NOT NULL  OPTIONS(description="User email from Google Auth session"),
  exam_name           STRING     NOT NULL  OPTIONS(description="Exam being studied"),
  topic               STRING     NOT NULL  OPTIONS(description="Topic the question was generated about"),
  difficulty          STRING               OPTIONS(description="easy|medium|hard"),
  generated_question  JSON                 OPTIONS(description="Full JSON object returned by Gemini"),
  user_answer         STRING               OPTIONS(description="A|B|C|D letter chosen by user"),
  correct_letter      STRING               OPTIONS(description="Correct answer letter from AI response"),
  is_correct          BOOL                 OPTIONS(description="TRUE if user_answer == correct_letter"),
  user_rating         INT64                OPTIONS(description="RLHF feedback: 1=thumbs_up, -1=thumbs_down, 0=neutral"),
  feedback_notes      STRING               OPTIONS(description="Free-text from user: e.g. 'product discontinued', 'question ambiguous'"),
  gemini_model_used   STRING               OPTIONS(description="Which Gemini model generated this question: gemini-2.5-pro, etc."),
  timestamp           TIMESTAMP  NOT NULL  OPTIONS(description="When the question was answered")
)
PARTITION BY DATE(timestamp)
CLUSTER BY user_email, exam_name
OPTIONS(
  description="User question history for scoring, analytics and adaptive learning",
  require_partition_filter=false
);

-- =============================================================================
-- VERIFICATION QUERIES (optional — run manually to confirm schema)
-- =============================================================================

-- SELECT table_name, creation_time
-- FROM `br-ventasbrasil-cld-01.edtech_platform.INFORMATION_SCHEMA.TABLES`;

-- =============================================================================
-- SAMPLE: How to INSERT a document chunk with inline embedding
-- (This is what the /api/ingest endpoint runs dynamically)
-- =============================================================================
/*
INSERT INTO `br-ventasbrasil-cld-01.edtech_platform.exam_documents`
  (id, exam_name, source_file, chunk_index, content, content_embedding, created_at)
VALUES (
  GENERATE_UUID(),
  'GCP-PCA',
  'gs://br-ventasbrasil-cld-01-exam-docs/gcp-pca-exam-guide.pdf',
  0,
  'A Professional Cloud Architect enables organizations to leverage...',
  (
    SELECT embedding
    FROM ML.GENERATE_EMBEDDING(
      MODEL `br-ventasbrasil-cld-01.edtech_platform.embedding_model`,
      (SELECT 'A Professional Cloud Architect enables organizations to leverage...' AS content)
    )
  ),
  CURRENT_TIMESTAMP()
);
*/

-- =============================================================================
-- CREATE BIGQUERY ML REMOTE MODEL (for ML.GENERATE_EMBEDDING)
-- Run ONCE after dataset creation.
-- Requires: roles/bigquery.connectionAdmin + Vertex AI enabled
-- =============================================================================

-- Step 1: Create a BigQuery connection to Vertex AI
-- Run in Cloud Shell:
--   bq mk --connection \
--     --location=US \
--     --project_id=br-ventasbrasil-cld-01 \
--     --connection_type=CLOUD_RESOURCE \
--     vertex_conn
--
-- Then grant the connection's service account the Vertex AI User role:
--   SA=$(bq show --connection br-ventasbrasil-cld-01.US.vertex_conn \
--     --format=json | jq -r '.cloudResource.serviceAccountId')
--   gcloud projects add-iam-policy-binding br-ventasbrasil-cld-01 \
--     --member="serviceAccount:$SA" \
--     --role="roles/aiplatform.user"

-- Step 2: Create the remote embedding model
CREATE MODEL IF NOT EXISTS `br-ventasbrasil-cld-01.edtech_platform.embedding_model`
REMOTE WITH CONNECTION `br-ventasbrasil-cld-01.us.vertex_conn`
OPTIONS (
  endpoint = 'text-embedding-004'
);

-- =============================================================================
-- SAMPLE: VECTOR_SEARCH query used in /api/generate-question
-- =============================================================================
/*
SELECT
  base.content,
  base.exam_name,
  distance
FROM
  VECTOR_SEARCH(
    TABLE `br-ventasbrasil-cld-01.edtech_platform.exam_documents`,
    'content_embedding',
    (
      SELECT ml_generate_embedding_result AS embedding
      FROM ML.GENERATE_EMBEDDING(
        MODEL `br-ventasbrasil-cld-01.edtech_platform.embedding_model`,
        (SELECT 'VPC network peering and shared VPC differences' AS content)
      )
    ),
    top_k => 3,
    distance_type => 'COSINE'
  )
WHERE base.exam_name = 'GCP-PCA'
ORDER BY distance ASC;
*/
