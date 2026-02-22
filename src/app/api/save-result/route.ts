// =============================================================================
// EdTechia — POST /api/save-result
// Called asynchronously after the user selects an answer in the Exam Arena.
// Inserts one row into BigQuery question_history.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBigQueryClient, BQ_TABLES } from '@/lib/bigquery';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    exam_id,
    topic_id,
    topic_name,
    difficulty,
    session_id,
    generated_question,
    user_answer,
    correct_letter,
    model_used,
    time_taken_seconds,
  } = body;

  if (!exam_id || !topic_id || !user_answer || !correct_letter) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const is_correct = user_answer === correct_letter;
  const project    = process.env.GCP_PROJECT_ID!;
  const dataset    = BQ_TABLES.dataset;
  const table      = BQ_TABLES.history;
  const bq         = getBigQueryClient();

  const query = `
    INSERT INTO \`${project}.${dataset}.${table}\`
      (id, session_id, user_email, exam_name, topic, difficulty,
       generated_question, user_answer, correct_letter, is_correct,
       user_rating, gemini_model_used, time_taken_seconds, timestamp)
    VALUES
      (@id, @session_id, @user_email, @exam_name, @topic, @difficulty,
       PARSE_JSON(@generated_question), @user_answer, @correct_letter, @is_correct,
       0, @model_used, @time_taken_seconds, CURRENT_TIMESTAMP())
  `;

  const rowId = uuidv4();
  try {
    const [job] = await bq.createQueryJob({
      query,
      useLegacySql: false,
      params: {
        id:                 rowId,
        session_id:         session_id ?? null,
        user_email:         session.user.email,
        exam_name:          exam_id,
        topic:              topic_name ?? topic_id,
        difficulty:         difficulty ?? 'medium',
        generated_question: JSON.stringify(generated_question),
        user_answer,
        correct_letter,
        is_correct,
        model_used:          model_used ?? null,
        time_taken_seconds:  time_taken_seconds != null ? Number(time_taken_seconds) : null,
      },
      types: {
        session_id:         'STRING',
        model_used:         'STRING',
        time_taken_seconds: 'INT64',
      },
      location: process.env.BQ_LOCATION ?? 'us-central1',
    });
    await job.getQueryResults();
  } catch (err) {
    console.error('[save-result] BigQuery insert failed:', err);
    return NextResponse.json(
      { error: 'Failed to save result', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, is_correct, id: rowId });
}
