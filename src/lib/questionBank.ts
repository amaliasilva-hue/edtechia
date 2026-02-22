// =============================================================================
// EdTechia — Server-Side Question Bank
//
// Module-level singleton that keeps a warm pool of pre-generated questions
// per (exam_id × topic_id × difficulty) key.
//
// ── Why module-level? ────────────────────────────────────────────────────────
// Cloud Run keeps container instances warm between requests. A module-level Map
// persists across requests on the SAME instance. The bank refills silently in
// background after each question is consumed, so users never wait for the LLM.
//
// ── Guarantees ───────────────────────────────────────────────────────────────
// - MIN_BANK questions target per key.
// - Only one concurrent refill per key (tracked in `refilling` set).
// - Hard cap MAX_BANK to avoid unbounded memory.
// - On the very first request for a key the bank is empty → falls back to
//   caller's on-demand generation, then kicks off background fill.
// =============================================================================

import { generateQuestionWithFallback } from '@/lib/vertexai';
import type { GeneratedQuestion } from '@/lib/vertexai';

export type BankQuestion = {
  question:     GeneratedQuestion;
  modelUsed:    string;
  generatedAt:  number; // Date.now()
};

const MIN_BANK = 10;
const MAX_BANK = 20;
// Questions older than 4 hours are discarded (stale)
const MAX_AGE_MS = 4 * 60 * 60 * 1000;

// The bank: key → queue of ready questions
const bank = new Map<string, BankQuestion[]>();

// Keys currently being refilled (prevents duplicate concurrent refills)
const refilling = new Set<string>();

function bankKey(examId: string, topicId: string, difficulty: string): string {
  return `${examId}:${topicId}:${difficulty}`;
}

function getQueue(key: string): BankQuestion[] {
  if (!bank.has(key)) bank.set(key, []);
  return bank.get(key)!;
}

function pruneStale(key: string): void {
  const queue = getQueue(key);
  const now = Date.now();
  const fresh = queue.filter(q => (now - q.generatedAt) < MAX_AGE_MS);
  if (fresh.length !== queue.length) {
    bank.set(key, fresh);
    console.log(`[questionBank] Pruned ${queue.length - fresh.length} stale questions for key=${key}`);
  }
}

/** Pop one question from the bank. Returns null if bank is empty. */
export function popFromBank(
  examId: string,
  topicId: string,
  difficulty: string
): BankQuestion | null {
  const key   = bankKey(examId, topicId, difficulty);
  pruneStale(key);
  const queue = getQueue(key);
  if (queue.length === 0) return null;
  const item = queue.shift()!;
  console.log(`[questionBank] Popped 1 question. Remaining: ${queue.length} for key=${key}`);
  return item;
}

/** Returns the current depth of the bank for a key (for diagnostics). */
export function bankDepth(examId: string, topicId: string, difficulty: string): number {
  const key = bankKey(examId, topicId, difficulty);
  pruneStale(key);
  return getQueue(key).length;
}

/**
 * Trigger a background refill if the bank is below MIN_BANK for this key.
 * Build the systemPrompt + userPrompt externally and pass them in —
 * the bank is prompt-agnostic.
 */
export function triggerRefillIfNeeded(
  examId: string,
  topicId: string,
  difficulty: string,
  buildPrompts: () => { systemPrompt: string; userPrompt: string },
): void {
  const key   = bankKey(examId, topicId, difficulty);
  pruneStale(key);
  const queue = getQueue(key);

  if (queue.length >= MIN_BANK) return;
  if (refilling.has(key)) return;

  const needed = MIN_BANK - queue.length;
  console.log(`[questionBank] Refilling ${needed} questions for key=${key} in background…`);
  refilling.add(key);

  // Fire-and-forget — never awaited so the HTTP response is not blocked
  ;(async () => {
    try {
      const { systemPrompt, userPrompt } = buildPrompts();
      let generated = 0;
      while (generated < needed) {
        const q = getQueue(key);
        if (q.length >= MAX_BANK) break;
        try {
          const result = await generateQuestionWithFallback(systemPrompt, userPrompt);
          q.push({ question: result.question, modelUsed: result.modelUsed, generatedAt: Date.now() });
          generated++;
          console.log(`[questionBank] +1 question (${generated}/${needed}) for key=${key}`);
        } catch (err) {
          console.warn(`[questionBank] Generation failed during refill for key=${key}:`, err);
          break;
        }
      }
    } finally {
      refilling.delete(key);
      console.log(`[questionBank] Refill done. Bank depth for key=${key}: ${getQueue(key).length}`);
    }
  })();
}

/** Stats for all keys — used by the /api/bank-status admin endpoint */
export function getBankStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  bank.forEach((queue, key) => {
    stats[key] = queue.length;
  });
  return stats;
}

/**
 * Proactively warm the bank for every (topicId × difficulty) combination of
 * a given exam. Call this from a non-blocking context (admin ping, dashboard
 * load, etc.) when you want the bank pre-filled before users start answering.
 *
 * @param examId   - exam identifier (e.g. "clf")
 * @param topics   - array of topic ids for this exam
 * @param difficulties - array of difficulty levels (e.g. ['easy','medium','hard'])
 * @param buildPrompts - factory that returns systemPrompt+userPrompt for a
 *                       given (topicId, difficulty) pair
 */
export function warmBankForExam(
  examId: string,
  topics: string[],
  difficulties: string[],
  buildPrompts: (topicId: string, difficulty: string) => { systemPrompt: string; userPrompt: string },
): void {
  for (const topicId of topics) {
    for (const difficulty of difficulties) {
      triggerRefillIfNeeded(
        examId,
        topicId,
        difficulty,
        () => buildPrompts(topicId, difficulty),
      );
    }
  }
  console.log(
    `[questionBank] warmBankForExam triggered for examId=${examId}, ` +
    `${topics.length} topics × ${difficulties.length} difficulties`
  );
}
