// =============================================================================
// EdTechia — GET /api/wrong-answers
// Returns the user's most recent wrong answers, optionally filtered by exam.
// Used by the Review page (/review) to show error deck.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { runQuery, BQ_TABLES } from '@/lib/bigquery';

export const runtime = 'nodejs';

export type WrongAnswer = {
  id:             string;
  exam_name:      string;
  topic:          string;
  difficulty:     string;
  question_text:  string | null;
  explanation_pt: string | null;
  user_answer:    string;
  correct_letter: string;
  timestamp:      string;
};

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const examFilter = searchParams.get('exam_id');
  const limit      = Math.min(Number(searchParams.get('limit') ?? '30'), 50);

  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const table   = BQ_TABLES.history;
  const fqt     = `\`${project}.${dataset}.${table}\``;

  const examClause = examFilter ? `AND exam_name = @exam_name` : '';

  const rows = await runQuery<WrongAnswer>(
    `SELECT
       id,
       exam_name,
       topic,
       difficulty,
       JSON_EXTRACT_SCALAR(generated_question, '$.question_en')    AS question_text,
       JSON_EXTRACT_SCALAR(generated_question, '$.explanation_pt') AS explanation_pt,
       user_answer,
       correct_letter,
       FORMAT_TIMESTAMP('%d/%m %H:%M', timestamp) AS timestamp
     FROM ${fqt}
     WHERE user_email   = @email
       AND is_correct   = FALSE
       ${examClause}
     ORDER BY timestamp DESC
     LIMIT @limit`,
    {
      email:     session.user.email,
      limit,
      ...(examFilter ? { exam_name: examFilter } : {}),
    }
  );

  return NextResponse.json({ wrong_answers: rows, total: rows.length });
}
