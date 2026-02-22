// =============================================================================
// EdTechia — POST /api/generate-question
// Pipeline:
//   1. Validate input (exam_id, topic_id, difficulty)
//   2. Check server-side Question Bank → return instantly if available
//   3. On cache miss: RAG → system prompt → Gemini
//   4. Always trigger background bank refill after serving
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getBigQueryClient, BQ_TABLES } from '@/lib/bigquery';
import { generateQuestionWithFallback } from '@/lib/vertexai';
import { getExamConfig } from '@/config/exams';
import { popFromBank, triggerRefillIfNeeded } from '@/lib/questionBank';

export const runtime = 'nodejs';

type RequestBody = {
  exam_id:         string;
  topic_id:        string;
  difficulty:      'easy' | 'medium' | 'hard';
  session_id?:     string;
  seen_questions?: string[];  // dedup: snippets of already-shown questions
};

// ─── Prompt builder (pure function — also called by the bank refiller) ────────
function buildPrompts(params: {
  examTitle:      string;
  persona:        string;
  technicalRules: string;
  topicName:      string;
  difficulty:     string;
  ragContext:     string;
  seen_questions?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const { examTitle, persona, technicalRules, topicName, difficulty, ragContext, seen_questions } = params;

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy:   'Associate level — foundational knowledge',
    medium: 'Professional level — architectural decision-making',
    hard:   'Expert/Architect level — forensic, multi-constraint scenarios',
  };

  const systemPrompt = `
You are a Level 5 Examiner for the ${examTitle} certification.
Your objective: generate ONE forensic, scenario-based multiple-choice question
focusing on the topic "${topicName}" at ${difficulty.toUpperCase()} level (${DIFFICULTY_LABEL[difficulty] ?? difficulty}).

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
${persona}

════════════════════════════════════════════════════════════
§3  EXAM-SPECIFIC TECHNICAL RULES
════════════════════════════════════════════════════════════
${technicalRules}

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
§5  VISUAL CONTEXT — DIFFICULTY-BASED EVIDENCE RULES
════════════════════════════════════════════════════════════
You MUST include a visual_context object in EVERY response.
The required type depends on the difficulty level:

  EASY   → ALWAYS use type "none". No diagram, no terminal output.
            Scenario must be a clear conceptual situation or straightforward
            config choice. content = "".

  MEDIUM → 50% chance: use "mermaid" or "terminal" (your choice based on
            scenario fit). Other 50%: use "none".
            If this question has a strong infrastructure or CLI angle → add it.
            If it is more of a concept/trade-off question → use "none".

  HARD   → ALWAYS include visual evidence. Choose "mermaid" OR "terminal"
            based on scenario:

5a. WHEN TO USE TYPE "mermaid" (hard/medium):
    Network routing, VPC peering/Service Controls, Kubernetes cluster topology,
    Load Balancer setup, multi-region architecture, Cloud Interconnect.
    Generate a valid Mermaid.js graph showing the CURRENT BROKEN state.
    use graph TD or sequenceDiagram.

5b. WHEN TO USE TYPE "terminal" (hard/medium):
    CLI command, gcloud/kubectl output, Cloud Logging output, firewall rules.
    Show the BROKEN state (502 error, permission denied, timeout).

Current difficulty: ${difficulty.toUpperCase()}

CRITICAL: visual_context must never reveal the correct answer.

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

  const userPrompt = `Generate one ${difficulty} question for the topic: "${topicName}" on the ${examTitle} certification exam.`;
  return { systemPrompt, userPrompt };
}

// ─── RAG helper ───────────────────────────────────────────────────────────────
async function fetchRagChunks(
  examId: string,
  topicName: string,
): Promise<string[]> {
  const project    = process.env.GCP_PROJECT_ID!;
  const dataset    = BQ_TABLES.dataset;
  const embedModel = process.env.BQ_EMBEDDING_MODEL ?? `${project}.${dataset}.embedding_model`;
  const bq         = getBigQueryClient();

  const ragQuery = `
    SELECT base.content, base.exam_name, distance
    FROM VECTOR_SEARCH(
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

  try {
    const [job] = await bq.createQueryJob({
      query: ragQuery,
      useLegacySql: false,
      params: { topic_text: topicName, exam_name: examId },
      location: process.env.BQ_LOCATION ?? 'US',
    });
    const [rows] = await job.getQueryResults();
    return (rows as Array<{ content: string }>).map((r) => r.content);
  } catch {
    return [];
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { exam_id, topic_id, difficulty = 'medium', session_id, seen_questions } = body;

  if (!exam_id || !topic_id) {
    return NextResponse.json({ error: 'exam_id and topic_id are required' }, { status: 400 });
  }

  let examConfig;
  try { examConfig = getExamConfig(exam_id); }
  catch { return NextResponse.json({ error: `Unknown exam_id: ${exam_id}` }, { status: 400 }); }

  const topic = examConfig.topics.find((t) => t.id === topic_id);
  if (!topic) {
    return NextResponse.json({ error: `Unknown topic_id: ${topic_id}` }, { status: 400 });
  }

  // ── Try the question bank first ────────────────────────────────────────────
  const banked = popFromBank(exam_id, topic_id, difficulty);

  let resultQuestion: { question: import('@/lib/vertexai').GeneratedQuestion; modelUsed: string; generatedAt: number } | undefined;
  let fromBank = false;

  if (banked) {
    // ✅ Instant response from bank
    fromBank = true;
    resultQuestion = banked;
    console.log('[generate-question] Served from bank ✅');
  } else {
    // ❌ Bank miss — generate on-demand
    console.log('[generate-question] Bank miss — generating on demand…');
    const ragChunks = await fetchRagChunks(exam_id, topic.name);
    const ragContext = ragChunks.length > 0
      ? ragChunks.join('\n\n---\n\n')
      : '(No reference material ingested yet. Generate a canonical question based on training data.)';

    const { systemPrompt, userPrompt } = buildPrompts({
      examTitle:      examConfig.title,
      persona:        examConfig.persona,
      technicalRules: examConfig.technicalRules,
      topicName:      topic.name,
      difficulty,
      ragContext,
      seen_questions,
    });

    try {
      const r = await generateQuestionWithFallback(systemPrompt, userPrompt);
      resultQuestion = { question: r.question, modelUsed: r.modelUsed, generatedAt: Date.now() };
    } catch (err) {
      console.error('[generate-question] All Gemini models failed:', err);
      return NextResponse.json(
        { error: 'AI generation failed', detail: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  // ── Always trigger background refill ──────────────────────────────────────
  triggerRefillIfNeeded(exam_id, topic_id, difficulty, () => {
    // This closure is called inside the bank refiller — fetch RAG lazily
    // We pass a simple prompt without seen_questions (bank questions are generic)
    const ragContext = '(Bank refill — generate a canonical question based on training data.)';
    return buildPrompts({
      examTitle:      examConfig.title,
      persona:        examConfig.persona,
      technicalRules: examConfig.technicalRules,
      topicName:      topic.name,
      difficulty,
      ragContext,
    });
  });

  return NextResponse.json({
    exam_id,
    exam_title:      examConfig.title,
    topic_id,
    topic_name:      topic.name,
    difficulty,
    session_id:      session_id ?? null,
    question:        resultQuestion!.question,
    model_used:      resultQuestion!.modelUsed,
    rag_chunks_used: fromBank ? 0 : -1, // -1 = on-demand, 0 = from bank
    from_bank:       fromBank,
  });
}

