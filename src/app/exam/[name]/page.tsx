'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { EXAMS_CONFIG } from '@/config/exams';
import { QuestionCard } from '@/components/QuestionCard';
import type { QuestionData } from '@/components/QuestionCard';
import { useExamTimer } from '@/hooks/useExamTimer';

const RECAP_AT = 10;

type GenerationResponse = {
  exam_id:        string;
  exam_title:     string;
  topic_id:       string;
  topic_name:     string;
  difficulty:     string;
  session_id:     string | null;
  question:       QuestionData;
  model_used:     string;
  rag_chunks_used: number;
};

export default function ExamArenaPage() {
  const params = useParams();
  const examId = params.name as string;
  const exam   = EXAMS_CONFIG[examId];

  // ── Config ─────────────────────────────────────────────────
  const [topicId,      setTopicId]      = useState('');
  const [difficulty,   setDifficulty]   = useState<'easy' | 'medium' | 'hard' | '__random__'>('medium');
  const [studyMode,    setStudyMode]    = useState(false);

  // ── Active question ───────────────────────────────────────────
  const [loading,      setLoading]      = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [current,      setCurrent]      = useState<GenerationResponse | null>(null);
  const [historyId,    setHistoryId]    = useState<string | null>(null);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [rating,       setRating]       = useState<number | null>(null);
  const [feedback,     setFeedback]     = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  // ── Session stats ───────────────────────────────────────────
  const [streak,         setStreak]         = useState(0);
  const [maxStreak,      setMaxStreak]      = useState(0);
  const [sessionCount,   setSessionCount]   = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [showRecap,      setShowRecap]      = useState(false);

  // ── Dedup ──────────────────────────────────────────────────────
  const seenQuestionsRef = useRef<string[]>([]);

  const timer = useExamTimer(() => {
    // Auto-answer with wrong letter when timer expires
    if (current && !selected) {
      const wrong = (['A','B','C','D'] as const).find(l => l !== current.question.correct_letter) ?? 'A';
      handleAnswer(wrong, 300);
    }
  });

  if (!exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Exam not found</h1>
          <p className="text-muted-foreground mt-2">ID: {examId}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-primary hover:underline">← Back</Link>
        </div>
      </div>
    );
  }

  const handleGenerate = async () => {
    if (!topicId) return;
    setLoading(true);
    setGenError(null);
    setCurrent(null);
    setSelected(null);
    setRating(null);
    setFeedback('');
    setShowFeedback(false);
    setHistoryId(null);
    if (!studyMode) timer.reset();

    const resolvedTopicId = topicId === '__random__'
      ? exam.topics[Math.floor(Math.random() * exam.topics.length)].id
      : topicId;

    const resolvedDifficulty = difficulty === '__random__'
      ? (['easy', 'medium', 'hard'] as const)[Math.floor(Math.random() * 3)]
      : difficulty;

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id:        examId,
          topic_id:       resolvedTopicId,
          difficulty:     resolvedDifficulty,
          seen_questions: seenQuestionsRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Falha na geração');
      setCurrent(data);
      const snippet = (data.question?.question_en ?? '').substring(0, 60);
      seenQuestionsRef.current = [...seenQuestionsRef.current.slice(-9), snippet];
      if (!studyMode) timer.start();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (letter: string, overrideElapsed?: number) => {
    if (!current || selected) return;
    const elapsed = studyMode ? 0 : (overrideElapsed ?? timer.elapsed);
    if (!studyMode) timer.reset();
    setSelected(letter);

    const isCorrect = letter === current.question.correct_letter;
    const newStreak = isCorrect ? streak + 1 : 0;
    setStreak(newStreak);
    setMaxStreak(m => Math.max(m, newStreak));
    const newCount = sessionCount + 1;
    setSessionCount(newCount);
    if (isCorrect) setSessionCorrect(c => c + 1);
    if (newCount >= RECAP_AT) setShowRecap(true);

    try {
      const res = await fetch('/api/save-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id:             examId,
          topic_id:            current.topic_id,
          topic_name:          current.topic_name,
          difficulty:          current.difficulty,
          session_id:          current.session_id,
          generated_question:  current.question,
          user_answer:         letter,
          correct_letter:      current.question.correct_letter,
          model_used:          current.model_used,
          time_taken_seconds:  elapsed,
        }),
      });
      const saved = await res.json();
      if (saved.success && saved.id) setHistoryId(saved.id);
    } catch { /* non-critical */ }
  };

  const handleRate = async (value: 1 | -1) => {
    setRating(value);
    if (!historyId) return;
    await fetch('/api/rate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_history_id: historyId, user_rating: value }),
    });
  };

  const handleFeedbackSubmit = async () => {
    if (!historyId || !feedback.trim()) return;
    await fetch('/api/rate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_history_id: historyId, user_rating: rating ?? 0, feedback_notes: feedback }),
    });
    setShowFeedback(false);
    setFeedback('');
  };

  const handleContinue = () => {
    setShowRecap(false);
    setSessionCount(0);
    setSessionCorrect(0);
    setStreak(0);
    setMaxStreak(0);
    seenQuestionsRef.current = [];
    setCurrent(null);
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm transition-colors shrink-0">
              ← Dashboard
            </Link>
            <span className="text-border hidden sm:block">|</span>
            <span className="text-sm font-medium text-foreground truncate hidden sm:block">{exam.title}</span>
          </div>
          {sessionCount > 0 && (
            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="px-2.5 py-1 rounded-full bg-secondary text-muted-foreground font-mono">
                {sessionCorrect}/{sessionCount}
              </span>
              {streak >= 2 && (
                <span className="px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 font-semibold">
                  🔥 {streak}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Config Panel */}
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configurar Questão</h2>
            <button
              onClick={() => setStudyMode(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                studyMode
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {studyMode ? '📚 Modo Estudo (sem timer)' : '⏱ Modo Exame (com timer)'}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Topic</label>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Selecione um tópico...</option>
                <option value="__random__">🎲 Todos os Tópicos (Sorteio)</option>
                <option disabled value="">──────────────</option>
                {exam.topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Dificuldade</label>
              <div className="flex gap-2 flex-wrap">
                {(['easy', 'medium', 'hard', '__random__'] as const).map((d) => (
                  <button key={d} onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors min-w-[60px] ${
                      difficulty === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}>
                    {d === 'easy' ? 'Fácil' : d === 'medium' ? 'Médio' : d === 'hard' ? 'Difícil' : '🎲 Sorteio'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={!topicId || loading}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                       hover:bg-primary/90 active:scale-[0.99] transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Gerando com Gemini...
              </span>
            ) : '⚡ Gerar Questão'}
          </button>
          {genError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{genError}</p>
          )}
        </div>

        {/* Question Card */}
        {current && (
          <QuestionCard
            question={current.question}
            modelUsed={current.model_used}
            topicName={current.topic_name}
            difficulty={current.difficulty}
            ragChunks={current.rag_chunks_used}
            selected={selected}
            onAnswer={handleAnswer}
            timerFormatted={timer.formattedTime}
            timerProgressPct={timer.progressPct}
            timerColorClass={timer.colorClass}
            timerBarClass={timer.barColorClass}
            timerState={timer.state}
            streak={streak}
            studyMode={studyMode}
            rating={rating}
            onRate={handleRate}
            onReport={() => setShowFeedback(!showFeedback)}
            showReport={showFeedback}
            reportText={feedback}
            onReportChange={setFeedback}
            onReportSubmit={handleFeedbackSubmit}
            onNext={handleGenerate}
          />
        )}
      </main>

      {/* ── Session Recap Modal ── */}
      {showRecap && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
            <div className="text-center">
              <div className="text-5xl mb-3">
                {sessionCorrect / RECAP_AT >= 0.8 ? '🏆' : sessionCorrect / RECAP_AT >= 0.6 ? '👏' : '💪'}
              </div>
              <h2 className="text-xl font-bold text-foreground">Sessão Concluída!</h2>
              <p className="text-muted-foreground text-sm mt-1">{RECAP_AT} questões respondidas</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                <span className="text-sm text-muted-foreground">Acurácia</span>
                <span className={`text-lg font-bold ${
                  sessionCorrect / RECAP_AT >= 0.8 ? 'text-green-400' :
                  sessionCorrect / RECAP_AT >= 0.6 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {sessionCorrect}/{RECAP_AT} ({Math.round(sessionCorrect / RECAP_AT * 100)}%)
                </span>
              </div>
              {maxStreak >= 2 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <span className="text-sm text-muted-foreground">Maior sequência</span>
                  <span className="text-lg font-bold text-orange-400">🔥 {maxStreak}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleContinue}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Continuar Praticando
              </button>
              <Link
                href="/dashboard"
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              >
                Ver Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
