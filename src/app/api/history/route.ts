// =============================================================================
// EdTechia — GET /api/history
// Full paginated answer history with filters.
// Query params:
//   exam_id    — filter by exam (optional)
//   result     — "all" | "correct" | "wrong"  (default: "all")
//   difficulty — "easy" | "medium" | "hard"   (optional)
//   page       — 1-based page number           (default: 1)
//   limit      — rows per page, max 50         (default: 25)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { runQuery, BQ_TABLES } from '@/lib/bigquery';

export const runtime = 'nodejs';

export type HistoryRow = {
  id:                 string;
  exam_name:          string;
  topic:              string;
  difficulty:         string;
  question_text:      string | null;
  user_answer:        string;
  correct_letter:     string;
  is_correct:         boolean;
  time_taken_seconds: number | null;
  timestamp:          string;
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const examId     = searchParams.get('exam_id') ?? '';
  const result     = searchParams.get('result') ?? 'all';       // all | correct | wrong
  const difficulty = searchParams.get('difficulty') ?? '';
  const page       = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit      = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '25')));
  const offset     = (page - 1) * limit;

  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const table   = BQ_TABLES.history;
  const fqt     = `\`${project}.${dataset}.${table}\``;

  const params: Record<string, string | number | boolean> = {
    email: session.user.email,
    limit,
    offset,
  };

  const clauses: string[] = ['user_email = @email'];

  if (examId) {
    clauses.push('exam_name = @exam_id');
    params.exam_id = examId;
  }
  if (result === 'correct') {
    clauses.push('is_correct = TRUE');
  } else if (result === 'wrong') {
    clauses.push('is_correct = FALSE');
  }
  if (difficulty) {
    clauses.push('difficulty = @difficulty');
    params.difficulty = difficulty;
  }

  const where = clauses.join(' AND ');

  // Count total matching rows (for pagination)
  const [countRow] = await runQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${fqt} WHERE ${where}`,
    params
  );
  const total = countRow?.total ?? 0;

  // Fetch the page
  const rows = await runQuery<HistoryRow>(
    `SELECT
       id,
       exam_name,
       topic,
       difficulty,
       JSON_EXTRACT_SCALAR(generated_question, '$.question_en') AS question_text,
       user_answer,
       correct_letter,
       is_correct,
       time_taken_seconds,
       FORMAT_TIMESTAMP('%d/%m %H:%M', timestamp) AS timestamp
     FROM ${fqt}
     WHERE ${where}
     ORDER BY timestamp DESC
     LIMIT @limit OFFSET @offset`,
    params
  );

  return NextResponse.json({
    rows,
    total,
    page,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  });
}
