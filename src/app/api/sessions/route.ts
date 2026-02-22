// =============================================================================
// EdTechia — /api/sessions
// GET  — list the current user's sessions
// POST — create a new exam session
// PATCH — finish a session and compute final score
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBigQueryClient, BQ_TABLES, runQuery } from '@/lib/bigquery';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

// ── GET — list user sessions ────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const table   = BQ_TABLES.sessions;

  const rows = await runQuery(
    `SELECT *
     FROM \`${project}.${dataset}.${table}\`
     WHERE user_email = @email
     ORDER BY started_at DESC
     LIMIT 50`,
    { email: session.user.email }
  );

  return NextResponse.json({ sessions: rows });
}

// ── POST — create session ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { exam_name, mode = 'practice', metadata = null } = body;

  if (!exam_name) {
    return NextResponse.json({ error: 'exam_name is required' }, { status: 400 });
  }

  const newId   = uuidv4();
  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const table   = BQ_TABLES.sessions;
  const bq      = getBigQueryClient();

  const query = `
    INSERT INTO \`${project}.${dataset}.${table}\`
      (id, user_email, exam_name, mode, started_at, total_questions, correct_count, metadata)
    VALUES
      (@id, @email, @exam_name, @mode, CURRENT_TIMESTAMP(), 0, 0, PARSE_JSON(@metadata))
  `;

  try {
    const [job] = await bq.createQueryJob({
      query,
      useLegacySql: false,
      params: {
        id:        newId,
        email:     session.user.email,
        exam_name,
        mode,
        metadata:  metadata ? JSON.stringify(metadata) : 'null',
      },
      location: process.env.BQ_LOCATION ?? 'US',
    });
    await job.getQueryResults();
  } catch (err) {
    console.error('[sessions] BigQuery insert failed:', err);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json({ session_id: newId });
}

// ── PATCH — finish session (compute final_score) ───────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const project = process.env.GCP_PROJECT_ID!;
  const dataset = BQ_TABLES.dataset;
  const bq      = getBigQueryClient();

  // Compute score from question_history, then update exam_sessions
  const query = `
    UPDATE \`${project}.${dataset}.${BQ_TABLES.sessions}\` s
    SET
      s.finished_at     = CURRENT_TIMESTAMP(),
      s.total_questions = stats.total,
      s.correct_count   = stats.correct,
      s.final_score     = ROUND(stats.correct / stats.total * 100, 1)
    FROM (
      SELECT
        COUNT(*) AS total,
        COUNTIF(is_correct = TRUE) AS correct
      FROM \`${project}.${dataset}.${BQ_TABLES.history}\`
      WHERE session_id = @session_id
        AND user_email = @email
    ) AS stats
    WHERE s.id = @session_id
      AND s.user_email = @email
  `;

  try {
    const [job] = await bq.createQueryJob({
      query,
      useLegacySql: false,
      params: { session_id, email: session.user.email },
      location: process.env.BQ_LOCATION ?? 'US',
    });
    await job.getQueryResults();
  } catch (err) {
    console.error('[sessions] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to finish session' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
