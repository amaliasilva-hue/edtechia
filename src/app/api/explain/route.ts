// =============================================================================
// EdTechia — POST /api/explain
// Given a question + the user's answer, generates a deeper explanation
// using Gemini. Used by the "Explicar mais" button in QuestionCard.
// Body: { question_text, options, user_answer, correct_letter, explanation_pt, topic, difficulty }
// Returns: { explanation: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { VertexAI } from '@google-cloud/vertexai';

export const runtime = 'nodejs';

const PROJECT  = process.env.GCP_PROJECT_ID     ?? 'br-ventasbrasil-cld-01';
const LOCATION = process.env.VERTEX_AI_LOCATION ?? 'us-central1';
const MODEL    = process.env.VERTEX_AI_MODEL_FALLBACK_1 ?? 'gemini-2.0-flash';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    question_text,
    options,
    user_answer,
    correct_letter,
    explanation_pt,
    topic,
    difficulty,
  } = body as {
    question_text:  string;
    options:        { A: string; B: string; C: string; D: string };
    user_answer:    string;
    correct_letter: string;
    explanation_pt: string;
    topic:          string;
    difficulty:     string;
  };

  const optionsText = Object.entries(options)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const prompt = `You are an expert GCP instructor helping a student understand a certification exam question deeply.

QUESTION:
${question_text}

OPTIONS:
${optionsText}

The student answered: ${user_answer}
The correct answer is: ${correct_letter}
${user_answer !== correct_letter ? `The student got this WRONG.` : `The student got this RIGHT.`}

EXISTING BRIEF EXPLANATION:
${explanation_pt}

Topic: ${topic} | Difficulty: ${difficulty}

---
Your task: Write a comprehensive explanation in Brazilian Portuguese (PT-BR) that:
1. Explains WHY ${correct_letter} is correct in detail — with real-world context
2. ${user_answer !== correct_letter ? `Explains specifically WHY ${user_answer} is WRONG — what misconception it represents` : 'Reinforces why the student\'s reasoning was correct'}
3. Gives a practical tip or mnemonic to remember this concept
4. Mentions any related GCP services/concepts the student should also know

Be direct, educational, and concise (3-5 paragraphs). Use plain text — no markdown headers or bullet lists.`;

  try {
    const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });
    const model = vertexAI.getGenerativeModel({
      model: MODEL,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return NextResponse.json({ explanation: text.trim() });
  } catch (err) {
    console.error('[explain] Gemini call failed:', err);
    return NextResponse.json(
      { error: 'Falha ao gerar explicação', detail: String(err) },
      { status: 500 }
    );
  }
}
