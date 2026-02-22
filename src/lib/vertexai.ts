// =============================================================================
// EdTechia — Vertex AI / Gemini Client
// Implements an automatic model fallback chain.
// Primary: gemini-2.5-pro (mandatory)
// Fallbacks: gemini-2.0-flash → gemini-1.5-pro-002 → gemini-1.5-flash-002
// =============================================================================

import { VertexAI, type GenerateContentRequest } from '@google-cloud/vertexai';

// ---------------------------------------------------------------------------
// Fallback chain — order matters. First model that succeeds wins.
// All env vars fall back to hardcoded defaults so the app works without .env.
// ---------------------------------------------------------------------------

export const MODEL_FALLBACK_CHAIN: string[] = [
  process.env.VERTEX_AI_MODEL_PRIMARY    ?? 'gemini-2.5-pro',
  process.env.VERTEX_AI_MODEL_FALLBACK_1 ?? 'gemini-2.0-flash',
  process.env.VERTEX_AI_MODEL_FALLBACK_2 ?? 'gemini-1.5-pro-002',
  process.env.VERTEX_AI_MODEL_FALLBACK_3 ?? 'gemini-1.5-flash-002',
];

const PROJECT   = process.env.GCP_PROJECT_ID      ?? 'br-ventasbrasil-cld-01';
const LOCATION  = process.env.VERTEX_AI_LOCATION  ?? 'us-central1';

// ---------------------------------------------------------------------------
// Response type returned by generateQuestion()
// ---------------------------------------------------------------------------

export type VisualContext = {
  type: 'mermaid' | 'terminal' | 'none';
  content: string;
};

export type GeneratedQuestion = {
  question_en: string;
  visual_context: VisualContext;
  options_en: { A: string; B: string; C: string; D: string };
  correct_letter: 'A' | 'B' | 'C' | 'D';
  explanation_pt: string;
};

export type GenerationResult = {
  question: GeneratedQuestion;
  modelUsed: string;
};

// ---------------------------------------------------------------------------
// Core generation function with fallback logic
// ---------------------------------------------------------------------------

/**
 * Calls Gemini models in the fallback chain until one succeeds.
 * Returns the parsed JSON question and the model that produced it.
 */
export async function generateQuestionWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<GenerationResult> {
  const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });

  let lastError: Error | null = null;

  for (const modelId of MODEL_FALLBACK_CHAIN) {
    try {
      const model = vertexAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 4096,
          // Enforce JSON output — prevents markdown wrapping
          responseMimeType: 'application/json',
        },
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }],
        },
      });

      const request: GenerateContentRequest = {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      };

      const response = await model.generateContent(request);
      const candidate = response.response.candidates?.[0];
      const rawText = candidate?.content?.parts?.[0]?.text ?? '';

      // Parse and validate the JSON output
      const parsed = parseAndValidateQuestion(rawText);

      console.log(`[vertexai] ✓ Success with model: ${modelId}`);
      return { question: parsed, modelUsed: modelId };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[vertexai] ✗ Model ${modelId} failed: ${lastError.message} — trying next...`);
    }
  }

  throw new Error(
    `All models in the fallback chain failed. Last error: ${lastError?.message}`
  );
}

// ---------------------------------------------------------------------------
// JSON validation
// ---------------------------------------------------------------------------

function parseAndValidateQuestion(raw: string): GeneratedQuestion {
  // Strip markdown code fences if the model ignores responseMimeType
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  const q = parsed as Record<string, unknown>;

  if (
    typeof q.question_en !== 'string' ||
    typeof q.options_en !== 'object' ||
    typeof q.correct_letter !== 'string' ||
    typeof q.explanation_pt !== 'string'
  ) {
    throw new Error(`Gemini JSON is missing required fields: ${JSON.stringify(q)}`);
  }

  const opts = q.options_en as Record<string, unknown>;
  if (!['A', 'B', 'C', 'D'].every((k) => typeof opts[k] === 'string')) {
    throw new Error(`Gemini options_en is missing A/B/C/D keys`);
  }

  if (!['A', 'B', 'C', 'D'].includes(q.correct_letter as string)) {
    throw new Error(`Gemini correct_letter is invalid: ${q.correct_letter}`);
  }

  // Normalise optional visual_context — provide a safe default if missing/invalid
  const vc = q.visual_context as Record<string, unknown> | undefined;
  if (!vc || !['mermaid', 'terminal', 'none'].includes(vc.type as string)) {
    q.visual_context = { type: 'none', content: '' };
  } else {
    q.visual_context = { type: vc.type, content: typeof vc.content === 'string' ? vc.content : '' };
  }

  return q as unknown as GeneratedQuestion;
}
