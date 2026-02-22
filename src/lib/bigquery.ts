// =============================================================================
// EdTechia — BigQuery Client
// Singleton client that is reused across API routes.
// All table identifiers are read from environment variables.
// =============================================================================

import { BigQuery } from '@google-cloud/bigquery';

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let _bq: BigQuery | null = null;

export function getBigQueryClient(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: process.env.GCP_PROJECT_ID!,
      // In production (Cloud Run etc.) the env var is base64-encoded JSON.
      // If GOOGLE_APPLICATION_CREDENTIALS is set (local dev), it is used automatically.
      ...(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64
        ? {
            credentials: JSON.parse(
              Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8')
            ),
          }
        : {}),
    });
  }
  return _bq;
}

// ---------------------------------------------------------------------------
// Table references (fully-qualified)
// ---------------------------------------------------------------------------

export const BQ_TABLES = {
  dataset: process.env.BQ_DATASET ?? 'edtech_platform',
  docs: process.env.BQ_TABLE_DOCS ?? 'exam_documents',
  sessions: process.env.BQ_TABLE_SESSIONS ?? 'exam_sessions',
  history: process.env.BQ_TABLE_HISTORY ?? 'question_history',

  /** Returns `project.dataset.table` string */
  fqn(table: 'docs' | 'sessions' | 'history'): string {
    const project = process.env.GCP_PROJECT_ID!;
    const names: Record<string, string> = {
      docs: BQ_TABLES.docs,
      sessions: BQ_TABLES.sessions,
      history: BQ_TABLES.history,
    };
    return `\`${project}.${BQ_TABLES.dataset}.${names[table]}\``;
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Runs a parameterized BigQuery query and returns all rows.
 * Uses standard SQL (legacy_sql = false).
 */
export async function runQuery<T = Record<string, unknown>>(
  query: string,
  params?: unknown[] | Record<string, unknown>
): Promise<T[]> {
  const bq = getBigQueryClient();
  const [job] = await bq.createQueryJob({
    query,
    useLegacySql: false,
    params: params ?? {},
    location: process.env.BQ_LOCATION ?? 'US',
  });
  const [rows] = await job.getQueryResults();
  return rows as T[];
}
