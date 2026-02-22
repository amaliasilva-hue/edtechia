// =============================================================================
// EdTechia — GET /api/insights
// Returns the current user's performance analytics from BigQuery:
//   - overall_accuracy: percentage of correct answers
//   - total_questions: total answered
//   - accuracy_by_exam: breakdown per exam (new)
//   - accuracy_by_topic: breakdown per exam + topic
//   - ai_quality: thumbs up/down ratio per model (RLHF)
//   - recent_activity: last 20 answers with question text + detail
// =============================================================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { runQuery, BQ_TABLES } from '@/lib/bigquery';

export const runtime = 'nodejs';

type ExamAccuracyRow = {
  exam_name:        string;
  total:            number;
  correct:          number;
  accuracy_pct:     number;
  avg_time_seconds: number | null;
};

type TopicAccuracyRow = {
  exam_name:       string;
  topic:           string;
  total:           number;
  correct:         number;
  accuracy_pct:    number;
  avg_time_seconds: number | null;
  timeouts:        number;
};

type AiQualityRow = {
  gemini_model_used: string;
  thumbs_up:         number;
  thumbs_down:       number;
  total_rated:       number;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = session.user.email;
  const project   = process.env.GCP_PROJECT_ID!;
  const dataset   = BQ_TABLES.dataset;
  const table     = BQ_TABLES.history;
  const fqt       = `\`${project}.${dataset}.${table}\``;

  try {
    // ── Overall accuracy ────────────────────────────────────────────────────
    const [overallRow] = await runQuery<{ total: number; correct: number }>(
      `SELECT
         COUNT(*) AS total,
         COUNTIF(is_correct = TRUE) AS correct
       FROM ${fqt}
       WHERE user_email = @email`,
      { email: userEmail }
    );

    const totalQuestions   = Number(overallRow?.total   ?? 0);
    const correctAnswers   = Number(overallRow?.correct ?? 0);
    const overallAccuracy  = totalQuestions > 0
      ? Math.round((correctAnswers / totalQuestions) * 100)
      : 0;

    // ── Accuracy by exam ───────────────────────────────────────────────────
    const accuracyByExam = await runQuery<ExamAccuracyRow>(
      `SELECT
         exam_name,
         COUNT(*) AS total,
         COUNTIF(is_correct = TRUE) AS correct,
         ROUND(COUNTIF(is_correct = TRUE) / COUNT(*) * 100, 1) AS accuracy_pct,
         ROUND(AVG(IF(time_taken_seconds IS NOT NULL, time_taken_seconds, NULL)), 1) AS avg_time_seconds
       FROM ${fqt}
       WHERE user_email = @email
       GROUP BY exam_name
       ORDER BY exam_name`,
      { email: userEmail }
    );

    // ── Accuracy by topic ───────────────────────────────────────────────────
    const accuracyByTopic = await runQuery<TopicAccuracyRow>(
      `SELECT
         exam_name,
         topic,
         COUNT(*) AS total,
         COUNTIF(is_correct = TRUE) AS correct,
         ROUND(COUNTIF(is_correct = TRUE) / COUNT(*) * 100, 1) AS accuracy_pct,
         ROUND(AVG(IF(time_taken_seconds IS NOT NULL, time_taken_seconds, NULL)), 1) AS avg_time_seconds,
         COUNTIF(time_taken_seconds >= 300) AS timeouts
       FROM ${fqt}
       WHERE user_email = @email
       GROUP BY exam_name, topic
       ORDER BY exam_name, accuracy_pct ASC`,
      { email: userEmail }
    );

    // ── AI Quality (RLHF) ───────────────────────────────────────────────────
    const aiQuality = await runQuery<AiQualityRow>(
      `SELECT
         COALESCE(gemini_model_used, 'unknown') AS gemini_model_used,
         COUNTIF(user_rating = 1)  AS thumbs_up,
         COUNTIF(user_rating = -1) AS thumbs_down,
         COUNTIF(user_rating != 0) AS total_rated
       FROM ${fqt}
       WHERE user_email = @email
         AND user_rating IS NOT NULL
       GROUP BY gemini_model_used
       ORDER BY total_rated DESC`,
      { email: userEmail }
    );

    // ── Recent 20 questions (with detail) ───────────────────────────────────────
    const recentActivity = await runQuery<{
      exam_name:          string;
      topic:              string;
      difficulty:         string;
      question_text:      string | null;
      user_answer:        string;
      correct_letter:     string;
      is_correct:         boolean;
      time_taken_seconds: number | null;
      timestamp:          string;
    }>(
      `SELECT
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
       WHERE user_email = @email
       ORDER BY timestamp DESC
       LIMIT 20`,
      { email: userEmail }
    );

    // ── Time analytics ──────────────────────────────────────────────────────
    const [timeRow] = await runQuery<{ avg_time_seconds: number | null; total_timeouts: number }>(
      `SELECT
         ROUND(AVG(IF(time_taken_seconds IS NOT NULL, time_taken_seconds, NULL)), 1) AS avg_time_seconds,
         COUNTIF(time_taken_seconds >= 300) AS total_timeouts
       FROM ${fqt}
       WHERE user_email = @email`,
      { email: userEmail }
    );

    return NextResponse.json({
      overall_accuracy:  overallAccuracy,
      total_questions:   totalQuestions,
      correct_answers:   correctAnswers,
      avg_time_seconds:  timeRow?.avg_time_seconds ?? null,
      total_timeouts:    Number(timeRow?.total_timeouts ?? 0),
      accuracy_by_exam:  accuracyByExam,
      accuracy_by_topic: accuracyByTopic,
      ai_quality:        aiQuality,
      recent_activity:   recentActivity,
    });
  } catch (err) {
    console.error('[insights] BigQuery query failed:', err);
    return NextResponse.json(
      { error: 'Failed to load insights', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
