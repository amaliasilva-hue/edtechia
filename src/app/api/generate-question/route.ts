// =============================================================================
// EdTechia — POST /api/generate-question
// Pipeline:
//   1. Validate input (exam_id, topic_id, difficulty)
//   2. Lookup exam config from EXAMS_CONFIG (persona + technicalRules)
//   3. Run BigQuery VECTOR_SEARCH to fetch top-3 RAG context chunks
//   4. Build composite system prompt (base rules + exam persona + tech rules)
//   5. Call Gemini with fallback chain (gemini-2.5-pro first)
//   6. Return parsed JSON question + metadata
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBigQueryClient, BQ_TABLES } from '@/lib/bigquery';
import { generateQuestionWithFallback } from '@/lib/vertexai';
import { getExamConfig } from '@/config/exams';

export const runtime = 'nodejs';

type RequestBody = {
  exam_id:         string;
  topic_id:        string;
  difficulty:      'easy' | 'medium' | 'hard';
  session_id?:     string;
  seen_questions?: string[];  // dedup: snippets of already-shown questions
};

export async function POST(req: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { exam_id, topic_id, difficulty = 'medium', session_id, seen_questions } = body;

  if (!exam_id || !topic_id) {
    return NextResponse.json({ error: 'exam_id and topic_id are required' }, { status: 400 });
  }

  // ── Lookup exam config ────────────────────────────────────────────────────
  let examConfig;
  try {
    examConfig = getExamConfig(exam_id);
  } catch {
    return NextResponse.json({ error: `Unknown exam_id: ${exam_id}` }, { status: 400 });
  }

  const topic = examConfig.topics.find((t) => t.id === topic_id);
  if (!topic) {
    return NextResponse.json({ error: `Unknown topic_id: ${topic_id} for exam ${exam_id}` }, { status: 400 });
  }

  // ── Step 1: RAG — BigQuery VECTOR_SEARCH ─────────────────────────────────
  const project    = process.env.GCP_PROJECT_ID!;
  const dataset    = BQ_TABLES.dataset;
  const embedModel = process.env.BQ_EMBEDDING_MODEL ?? `${project}.${dataset}.embedding_model`;
  const bq         = getBigQueryClient();

  const ragQuery = `
    SELECT
      base.content,
      base.exam_name,
      distance
    FROM
      VECTOR_SEARCH(
        TABLE \`${project}.${dataset}.${BQ_TABLES.docs}\`,
        'content_embedding',
        (
          SELECT ml_generate_embedding_result AS embedding
          FROM ML.GENERATE_EMBEDDING(
            MODEL \`${embedModel}\`,
            (SELECT @topic_text AS content)
          )
          LIMIT 1
        ),
        top_k => 3,
        distance_type => 'COSINE'
      )
    WHERE base.exam_name = @exam_name
    ORDER BY distance ASC
  `;

  let ragChunks: string[] = [];

  try {
    const [job] = await bq.createQueryJob({
      query: ragQuery,
      useLegacySql: false,
      params: {
        topic_text: topic.name,
        exam_name:  examConfig.id,
      },
      location: process.env.BQ_LOCATION ?? 'US',
    });
    const [rows] = await job.getQueryResults();
    ragChunks = (rows as Array<{ content: string }>).map((r) => r.content);
    console.log(`[generate-question] RAG returned ${ragChunks.length} chunks`);
  } catch (err) {
    console.warn('[generate-question] VECTOR_SEARCH failed (no docs ingested yet?), continuing without RAG:', err);
    // Non-fatal: continue without RAG context
  }

  const ragContext = ragChunks.length > 0
    ? ragChunks.join('\n\n---\n\n')
    : '(No reference material ingested yet for this exam. Generate a canonical question based on your training data.)';

  // ── Step 2: Build system prompt ───────────────────────────────────────────
  //
  // Structure:
  //   [BASE EXAMINER RULES — universal for all exams]
  //   [EXAM PERSONA — from examConfig.persona]
  //   [EXAM TECHNICAL RULES — from examConfig.technicalRules]
  //   [OUTPUT FORMAT — strict JSON schema]

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy:   'Associate level — foundational knowledge',
    medium: 'Professional level — architectural decision-making',
    hard:   'Expert/Architect level — forensic, multi-constraint scenarios',
  };

  const systemPrompt = `
You are a Level 5 Examiner for the ${examConfig.title} certification.
Your objective: generate ONE forensic, scenario-based multiple-choice question
focusing on the topic "${topic.name}" at ${difficulty.toUpperCase()} level (${DIFFICULTY_LABEL[difficulty]}).

════════════════════════════════════════════════════════════
§1  KNOWLEDGE USAGE — RAG AS BLUEPRINT, NOT A JAIL
════════════════════════════════════════════════════════════
1a. THE BLUEPRINT (RAG Context)
    Use the retrieved context STRICTLY to understand the SCOPE, boundaries,
    and syllabus requirements of this exam section. It tells you WHAT is in
    scope — not how deep or creative you can be.
    <context>
    ${ragContext}
    </context>

1b. THE MUSCLE (Internal Expert Knowledge)
    DO NOT limit your scenario to only what is literally written above.
    You MUST leverage your extensive internal expertise as a Senior Cloud
    Architect / SRE / Security Engineer to INVENT a highly realistic, complex
    production incident or architectural decision.
    Generate technical evidence from scratch:
      • realistic Cloud Logging JSON snippets
      • functioning YAML / Terraform / HCL configs
      • plausible IAM policy JSON with exact numeric IDs
      • real CLI output with exit codes and stderr lines
      • Kubernetes YAML manifests or Helm values
    The evidence MUST make sense end-to-end — it must be the forensic clue
    that leads to the answer.

════════════════════════════════════════════════════════════
§2  EXAM PERSONA
════════════════════════════════════════════════════════════
${examConfig.persona}

════════════════════════════════════════════════════════════
§3  EXAM-SPECIFIC TECHNICAL RULES
════════════════════════════════════════════════════════════
${examConfig.technicalRules}

════════════════════════════════════════════════════════════
§4  UNIVERSAL MANDATORY RULES (violation = rejected output)
════════════════════════════════════════════════════════════
Rule 1 — NO DEFINITIONS. Never ask "What is X?" or "Which service does Y?".
         Always present a real-world incident, misconfiguration, or
         architectural trade-off decision.

Rule 2 — TECHNICAL EVIDENCE REQUIRED. Embed at least ONE block of:
         Cloud Logging JSON | YAML/Terraform | GCP Console error |
         IAM policy JSON | gcloud / kubectl CLI output.
         Evidence must be the CLUE, not the answer.

Rule 3 — BUSINESS CONSTRAINTS. The correct answer must depend on a stated
         constraint: cost optimisation, compliance (HIPAA/PCI/SOC2/FedRAMP),
         SLA targets, RPO/RTO, team size, or multi-region requirements.

Rule 4 — PLAUSIBLE DISTRACTORS. All 4 options must be technically sensible
         configurations. Wrong answers = common architectural mistakes or
         misapplied best-practices, NOT obviously wrong choices.

Rule 5 — SINGLE CORRECT ANSWER satisfying ALL stated constraints at once.

Rule 6 — EXPLANATION IN PORTUGUESE (explanation_pt):
         • WHY the correct answer satisfies ALL constraints.
         • WHY each wrong answer fails — one line each with the specific trap.
         • Reference the canonical GCP documentation concept when applicable.

════════════════════════════════════════════════════════════
§5  VISUAL CONTEXT — EVIDENCE FIRST, NEVER THE SOLUTION
════════════════════════════════════════════════════════════
You MUST include a visual_context object in EVERY response.

5a. WHEN TO USE TYPE "mermaid":
    If the scenario involves: network routing, VPC peering/Service Controls,
    Kubernetes cluster topology, Load Balancer setup, multi-region architecture,
    Cloud Interconnect, or any infrastructure diagram — generate a valid
    Mermaid.js graph string showing the CURRENT BROKEN or QUESTIONABLE state.
    The diagram must show the problem (e.g. missing route, wrong firewall,
    unreachable subnet) WITHOUT revealing the fix. Use graph TD or sequenceDiagram.

5b. WHEN TO USE TYPE "terminal":
    If the scenario involves: a CLI command, gcloud/kubectl output, firewall
    rule listing, Cloud Logging output, or any text the user would see in a
    terminal — generate a realistic terminal output snippet (fake but plausible
    log lines, exit codes, error messages).
    Show the BROKEN state (e.g. 502 error, permission denied, timeout).

5c. WHEN TO USE TYPE "none":
    Only when the scenario is purely conceptual (IAM policy comparison, pricing
    calculation). In this case set content to "".

CRITICAL: visual_context is the FORENSIC EVIDENCE of the problem.
          It must never hint at or reveal the correct answer option.

════════════════════════════════════════════════════════════
§7  DEDUPLICATION — DO NOT REPEAT QUESTIONS
════════════════════════════════════════════════════════════
${seen_questions && seen_questions.length > 0
  ? `The following question topics/situations were ALREADY asked this session.
Generate a COMPLETELY DIFFERENT scenario (different service, different failure mode, different constraint):
${seen_questions.map((q, i) => `  ${i+1}. "${q}..."`).join('\n')}`
  : '(No previous questions to avoid.)'}

════════════════════════════════════════════════════════════
§6  OUTPUT FORMAT — STRICT
════════════════════════════════════════════════════════════
Return ONLY the raw JSON object below.
NO markdown fences, NO backticks, NO preamble, NO trailing text.
The response must be parseable by JSON.parse() with zero preprocessing.

{
  "question_en": "<full scenario with embedded technical evidence block>",
  "visual_context": {
    "type": "mermaid" | "terminal" | "none",
    "content": "<valid Mermaid string OR terminal text OR empty string>"
  },
  "options_en": {
    "A": "<plausible option>",
    "B": "<plausible option>",
    "C": "<plausible option>",
    "D": "<plausible option>"
  },
  "correct_letter": "<A|B|C|D>",
  "explanation_pt": "<detailed Portuguese explanation with per-distractor analysis>"
}
`.trim();

  const userPrompt = `Generate one ${difficulty} question for the topic: "${topic.name}" on the ${examConfig.title} certification exam.`;

  // ── Step 3: Generate with Gemini fallback chain ───────────────────────────
  let result;
  try {
    result = await generateQuestionWithFallback(systemPrompt, userPrompt);
  } catch (err) {
    console.error('[generate-question] All Gemini models failed:', err);
    return NextResponse.json(
      { error: 'AI generation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    exam_id,
    exam_title:    examConfig.title,
    topic_id,
    topic_name:    topic.name,
    difficulty,
    session_id:    session_id ?? null,
    question:      result.question,
    model_used:    result.modelUsed,
    rag_chunks_used: ragChunks.length,
  });
}
