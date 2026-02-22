// =============================================================================
// EdTechia — POST /api/rate-question   (RLHF feedback endpoint)
// Updates user_rating and feedback_notes on an existing question_history row.
// Called when user clicks 👍, 👎, or submits "Reportar Erro".
// user_rating: 1 = thumbs up, -1 = thumbs down, 0 = neutral
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBigQueryClient, BQ_TABLES } from '@/lib/bigquery';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { question_history_id, user_rating, feedback_notes } = body;

  if (!question_history_id || user_rating === undefined) {
    return NextResponse.json({ error: 'question_history_id and user_rating are required' }, { status: 400 });
  }

  if (![-1, 0, 1].includes(Number(user_rating))) {
    return NextResponse.json({ error: 'user_rating must be -1, 0, or 1' }, { status: 400 });
  }

  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const table   = BQ_TABLES.history;
  const bq      = getBigQueryClient();

  // BigQuery UPDATE — only the requesting user can rate their own questions
  const query = `
    UPDATE \`${project}.${dataset}.${table}\`
    SET
      user_rating    = @user_rating,
      feedback_notes = @feedback_notes
    WHERE id         = @id
      AND user_email = @user_email
  `;

  try {
    const [job] = await bq.createQueryJob({
      query,
      useLegacySql: false,
      params: {
        id:             question_history_id,
        user_rating:    Number(user_rating),
        feedback_notes: feedback_notes ?? null,
        user_email:     session.user.email,
      },
      types: {
        feedback_notes: 'STRING',
      },
      location: process.env.BQ_LOCATION ?? 'us-central1',
    });
    await job.getQueryResults();
  } catch (err) {
    console.error('[rate-question] BigQuery UPDATE failed:', err);
    return NextResponse.json(
      { error: 'Failed to save rating', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
