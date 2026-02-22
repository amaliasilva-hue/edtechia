'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { EXAM_LIST, EXAMS_CONFIG } from '@/config/exams';
import type { QuestionData } from '@/components/QuestionCard';

// ─── Types ───────────────────────────────────────────────────────────────────

type SimDifficulty = 'easy' | 'medium' | 'hard' | '__random__';

type SimQuestion = {
  exam_id:     string;
  topic_id:    string;
  topic_name:  string;
  difficulty:  string;
  session_id:  string | null;
  model_used:  string;
  question:    QuestionData;
  from_bank:   boolean;
};

type Answer = {
  question:       SimQuestion;
  user_answer:    string;
  is_correct:     boolean;
  time_seconds:   number;
  history_id:     string | null;
};

type Phase = 'config' | 'running' | 'finished';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_SIZES = [10, 25, 50];
// 2h for 50 questions, proportional
const SECONDS_PER_QUESTION = 144;

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

// ─── Option style ─────────────────────────────────────────────────────────────

function getOptionStyle(
  letter: string,
  selected: string | null,
  correctLetter: string,
  reveal: boolean,
): string {
  const base = 'w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-150 ';
  if (!selected || !reveal) {
    if (selected === letter) return base + 'border-primary bg-primary/10 text-primary';
    return base + 'border-border bg-secondary/30 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]';
  }
  if (letter === correctLetter) return base + 'border-green-500 bg-green-500/10 text-green-300';
  if (letter === selected)       return base + 'border-red-500 bg-red-500/10 text-red-300';
  return base + 'border-border bg-secondary/20 text-muted-foreground opacity-40';
}

// ─── Timer display ─────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SimuladoPage() {
  // Config state
  const [phase,       setPhase]       = useState<Phase>('config');
  const [examId,      setExamId]      = useState('');
  const [topicIds,    setTopicIds]    = useState<string[]>([]);   // empty = all topics
  const [simDiff,     setSimDiff]     = useState<SimDifficulty>('__random__');
  const [totalQ,      setTotalQ]      = useState(25);
  const [customQ,     setCustomQ]     = useState('');
  const [revealMode,  setRevealMode]  = useState(false); // show answer after each Q?

  // Running state
  const [questions,   setQuestions]   = useState<SimQuestion[]>([]);
  const [answers,     setAnswers]     = useState<Answer[]>([]);
  const [currentIdx,  setCurrentIdx]  = useState(0);
  const [selected,    setSelected]    = useState<string | null>(null);
  const [revealed,    setRevealed]    = useState(false);
  const [timeLeft,    setTimeLeft]    = useState(0);
  const [startTime,   setStartTime]   = useState(0);
  const [qStartTime,  setQStartTime]  = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Pre-fetch pipeline: next question being fetched
  const nextRef    = useRef<SimQuestion | null>(null);
  const fetchingNext = useRef(false);
  const seenRef    = useRef<string[]>([]);

  const exam = examId ? EXAMS_CONFIG[examId] : null;

  // ── Fetch one question ──────────────────────────────────────────────────────
  const fetchQuestion = useCallback(async (forExamId: string, forTopicIds: string[], forDiff: SimDifficulty): Promise<SimQuestion | null> => {
    const e = EXAMS_CONFIG[forExamId];
    if (!e) return null;

    const topics = forTopicIds.length > 0 ? forTopicIds : e.topics.map(t => t.id);
    const topic_id = topics[Math.floor(Math.random() * topics.length)];
    const difficulty = forDiff === '__random__'
      ? (['easy', 'medium', 'hard'] as const)[Math.floor(Math.random() * 3)]
      : forDiff;

    try {
      const res = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id: forExamId,
          topic_id,
          difficulty,
          seen_questions: seenRef.current,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const snippet = (data.question?.question_en ?? '').substring(0, 60);
      seenRef.current = [...seenRef.current.slice(-19), snippet];
      return data as SimQuestion;
    } catch {
      return null;
    }
  }, []);

  // ── Prefetch next question into nextRef ─────────────────────────────────────
  const prefetchNext = useCallback(async (forExamId: string, forTopicIds: string[], forDiff: SimDifficulty) => {
    if (fetchingNext.current || nextRef.current) return;
    fetchingNext.current = true;
    try {
      const q = await fetchQuestion(forExamId, forTopicIds, forDiff);
      nextRef.current = q;
    } finally {
      fetchingNext.current = false;
    }
  }, [fetchQuestion]);

  // ── Start simulado ──────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    seenRef.current = [];
    nextRef.current = null;

    // Fetch the first question
    const first = await fetchQuestion(examId, topicIds, simDiff);
    if (!first) {
      setError('Falha ao gerar a primeira questão. Tente novamente.');
      setLoading(false);
      return;
    }

    const n = customQ ? parseInt(customQ) || totalQ : totalQ;
    setQuestions([first]);
    setAnswers([]);
    setCurrentIdx(0);
    setSelected(null);
    setRevealed(false);
    setTimeLeft(n * SECONDS_PER_QUESTION);
    setStartTime(Date.now());
    setQStartTime(Date.now());
    setPhase('running');
    setLoading(false);

    // Pre-fetch Q2 immediately
    prefetchNext(examId, topicIds, simDiff);
  };

  // ── Global countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          setPhase('finished');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const actualTotal = customQ ? (parseInt(customQ) || totalQ) : totalQ;

  // ── Select an answer (no submit yet in exam mode) ───────────────────────────
  const handleSelect = (letter: string) => {
    if (selected !== null) return;
    setSelected(letter);
    if (revealMode) setRevealed(true);
  };

  // ── Confirm answer and move to next ────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selected) return;
    const q = questions[currentIdx];
    const isCorrect = selected === q.question.correct_letter;
    const timeTaken = Math.round((Date.now() - qStartTime) / 1000);

    // Save to BQ (fire-and-forget)
    let historyId: string | null = null;
    try {
      const res = await fetch('/api/save-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id:            q.exam_id,
          topic_id:           q.topic_id,
          topic_name:         q.topic_name,
          difficulty:         q.difficulty,
          session_id:         q.session_id,
          generated_question: q.question,
          user_answer:        selected,
          correct_letter:     q.question.correct_letter,
          model_used:         q.model_used,
          time_taken_seconds: timeTaken,
        }),
      });
      const saved = await res.json();
      if (saved.success && saved.id) historyId = saved.id;
    } catch { /* non-critical */ }

    const newAnswers = [...answers, { question: q, user_answer: selected, is_correct: isCorrect, time_seconds: timeTaken, history_id: historyId }];
    setAnswers(newAnswers);

    // Last question?
    if (newAnswers.length >= actualTotal) {
      setPhase('finished');
      return;
    }

    // Move to next question
    let next: SimQuestion | null = null;

    // Try pre-fetched first
    if (nextRef.current) {
      next = nextRef.current;
      nextRef.current = null;
    } else {
      // Fallback: fetch on-demand
      next = await fetchQuestion(examId, topicIds, simDiff);
    }

    if (!next) {
      setError('Falha ao carregar próxima questão.');
      setPhase('finished');
      return;
    }

    const newQuestions = [...questions, next];
    setQuestions(newQuestions);
    setCurrentIdx(currentIdx + 1);
    setSelected(null);
    setRevealed(false);
    setQStartTime(Date.now());

    // Pre-fetch the one after
    if (newAnswers.length + 1 < actualTotal) {
      prefetchNext(examId, topicIds, simDiff);
    }
  };

  // ── Render: Config ──────────────────────────────────────────────────────────
  if (phase === 'config') {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← Dashboard</Link>
            <span className="text-border">|</span>
            <span className="text-sm font-semibold text-foreground">Simulado</span>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Configurar Simulado</h1>
            <p className="text-muted-foreground text-sm mt-1">Escolha a prova, número de questões e dificuldade</p>
          </div>

          {/* Exam selector */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Prova</h2>
            <div className="grid grid-cols-1 gap-2">
              {EXAM_LIST.map((e) => (
                <button key={e.id} onClick={() => { setExamId(e.id); setTopicIds([]); }}
                  className={`text-left p-3 rounded-xl border text-sm transition-all ${
                    examId === e.id
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border bg-secondary/30 hover:border-primary/40 text-foreground'
                  }`}>
                  {e.title}
                </button>
              ))}
            </div>
          </div>

          {/* Topic filter (optional) */}
          {exam && (
            <div className="p-5 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tópicos</h2>
                <button onClick={() => setTopicIds([])} className="text-xs text-primary hover:underline">
                  {topicIds.length === 0 ? '✓ Todos' : 'Selecionar todos'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {exam.topics.map((t) => (
                  <button key={t.id}
                    onClick={() => setTopicIds(prev =>
                      prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                    )}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      topicIds.includes(t.id)
                        ? 'bg-primary/15 text-primary border border-primary/30 font-medium'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}>
                    {t.name.length > 35 ? t.name.slice(0, 35) + '…' : t.name}
                  </button>
                ))}
              </div>
              {topicIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{topicIds.length} tópico(s) selecionado(s)</p>
              )}
            </div>
          )}

          {/* Difficulty */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dificuldade</h2>
            <div className="grid grid-cols-4 gap-2">
              {(['easy', 'medium', 'hard', '__random__'] as SimDifficulty[]).map((d) => (
                <button key={d} onClick={() => setSimDiff(d)}
                  className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    simDiff === d ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}>
                  {d === 'easy' ? '🟢 Fácil' : d === 'medium' ? '🟡 Médio' : d === 'hard' ? '🔴 Difícil' : '🎲 Misto'}
                </button>
              ))}
            </div>
          </div>

          {/* Number of questions */}
          <div className="p-5 rounded-xl border border-border bg-card space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Questões</h2>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_SIZES.map((n) => (
                <button key={n} onClick={() => { setTotalQ(n); setCustomQ(''); }}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    totalQ === n && !customQ ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground shrink-0">Personalizado:</span>
              <input
                type="number" min="1" max="100"
                value={customQ}
                onChange={(e) => setCustomQ(e.target.value)}
                placeholder="ex: 40"
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ⏱ Tempo estimado: {formatTime((customQ ? parseInt(customQ) || totalQ : totalQ) * SECONDS_PER_QUESTION)}
            </p>
          </div>

          {/* Reveal mode */}
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Mostrar resposta após cada questão</div>
                <div className="text-xs text-muted-foreground mt-0.5">Desativado = modo exame real (gabarito só no final)</div>
              </div>
              <button onClick={() => setRevealMode(m => !m)}
                className={`relative w-11 h-6 rounded-full transition-colors ${revealMode ? 'bg-primary' : 'bg-secondary'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${revealMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button onClick={handleStart} disabled={!examId || loading}
            className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Carregando primeira questão…
              </span>
            ) : `🚀 Iniciar Simulado (${customQ || totalQ} questões)`}
          </button>
        </main>
      </div>
    );
  }

  // ── Render: Finished ────────────────────────────────────────────────────────
  if (phase === 'finished') {
    const correct = answers.filter(a => a.is_correct).length;
    const total   = answers.length;
    const pct     = total > 0 ? Math.round(correct / total * 100) : 0;
    const byTopic = answers.reduce<Record<string, { correct: number; total: number }>>((acc, a) => {
      const k = a.question.topic_name;
      if (!acc[k]) acc[k] = { correct: 0, total: 0 };
      acc[k].total++;
      if (a.is_correct) acc[k].correct++;
      return acc;
    }, {});
    const emoji = pct >= 80 ? '🏆' : pct >= 70 ? '👏' : pct >= 60 ? '💪' : '📚';

    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm">← Dashboard</Link>
            <span className="text-border">|</span>
            <span className="text-sm font-semibold">Resultado do Simulado</span>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          {/* Score */}
          <div className="p-8 rounded-2xl border border-border bg-card text-center space-y-4">
            <div className="text-6xl">{emoji}</div>
            <h1 className="text-3xl font-bold text-foreground">{pct}%</h1>
            <p className="text-muted-foreground">{correct} corretas de {total} questões</p>
            <div className="h-3 bg-secondary rounded-full overflow-hidden max-w-xs mx-auto">
              <div
                className={`h-full rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct >= 70
              ? <p className="text-green-400 text-sm font-medium">Aprovado! 🎉 Acima do limiar de 70%</p>
              : <p className="text-red-400 text-sm font-medium">Abaixo de 70% — continue praticando!</p>
            }
          </div>

          {/* By topic */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Resultado por Tópico</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(byTopic)
                .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
                .map(([topic, data]) => {
                  const topicPct = Math.round(data.correct / data.total * 100);
                  return (
                    <div key={topic} className="p-4 rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-foreground font-medium truncate pr-3">{topic}</span>
                        <span className={`text-xs font-bold shrink-0 ${topicPct >= 70 ? 'text-green-400' : topicPct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{topicPct}%</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${topicPct >= 70 ? 'bg-green-500' : topicPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${topicPct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{data.correct}/{data.total}</div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Gabarito */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Gabarito Completo</h2>
            <div className="space-y-3">
              {answers.map((a, i) => (
                <div key={i} className={`p-4 rounded-xl border ${a.is_correct ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{a.is_correct ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs text-muted-foreground font-mono">Q{i+1}</span>
                        <span className="text-xs text-muted-foreground">{a.question.topic_name}</span>
                        {!a.is_correct && (
                          <span className="text-xs">
                            Você: <span className="text-red-400 font-bold">{a.user_answer}</span>
                            {' '}→ Certa: <span className="text-green-400 font-bold">{a.question.question.correct_letter}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed line-clamp-2">
                        {a.question.question.question_en.slice(0, 150)}…
                      </p>
                      {!a.is_correct && (
                        <details className="mt-2">
                          <summary className="text-xs text-primary cursor-pointer hover:underline">Ver explicação →</summary>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.question.question.explanation_pt}</p>
                        </details>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{a.time_seconds}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setPhase('config'); setAnswers([]); setQuestions([]); setCurrentIdx(0); }}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90">
              Novo Simulado
            </button>
            <Link href="/dashboard" className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-center text-muted-foreground hover:text-foreground">
              Ver Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Render: Running ─────────────────────────────────────────────────────────
  const currentQ = questions[currentIdx];
  if (!currentQ) return null;

  const progress = ((currentIdx) / actualTotal) * 100;
  const timeColor = timeLeft > actualTotal * SECONDS_PER_QUESTION * 0.3
    ? 'text-emerald-400' : timeLeft > actualTotal * SECONDS_PER_QUESTION * 0.1
    ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-2.5">
          {/* Top row: title + timer + counter */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-foreground hidden sm:block truncate">{exam?.title}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`font-mono text-base font-bold tabular-nums ${timeColor}`}>
                {formatTime(timeLeft)}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {currentIdx + 1} / {actualTotal}
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-secondary rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Metadata */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span className="px-2 py-0.5 rounded-full bg-secondary">{currentQ.topic_name}</span>
          <span className="px-2 py-0.5 rounded-full bg-secondary capitalize">
            {currentQ.difficulty === 'easy' ? '🟢 Fácil' : currentQ.difficulty === 'medium' ? '🟡 Médio' : '🔴 Difícil'}
          </span>
          {currentQ.from_bank && (
            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">⚡ Banco</span>
          )}
        </div>

        {/* Question text */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap font-mono">
            {currentQ.question.question_en}
          </p>
        </div>

        {/* Visual context */}
        {currentQ.question.visual_context?.type !== 'none' && currentQ.question.visual_context?.content && (
          <div className="rounded-xl overflow-hidden border border-slate-700 font-mono text-sm shadow-2xl">
            <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 border-b border-slate-700">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <span className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <pre className="bg-slate-900 text-green-400 p-4 overflow-x-auto leading-relaxed whitespace-pre text-xs max-h-60">
              {currentQ.question.visual_context.content}
            </pre>
          </div>
        )}

        {/* Options */}
        <div className="space-y-2">
          {OPTION_KEYS.map(letter => (
            <button key={letter}
              onClick={() => handleSelect(letter)}
              disabled={selected !== null && !revealMode}
              className={getOptionStyle(letter, selected, currentQ.question.correct_letter, revealed)}>
              <span className="font-semibold mr-3 font-mono">{letter}.</span>
              {currentQ.question.options_en[letter]}
            </button>
          ))}
        </div>

        {/* Reveal mode: show explanation */}
        {revealMode && revealed && (
          <div className="p-5 rounded-xl border border-border bg-secondary/30">
            <div className={`text-sm font-semibold mb-2 ${selected === currentQ.question.correct_letter ? 'text-green-400' : 'text-red-400'}`}>
              {selected === currentQ.question.correct_letter ? '✅ Correto!' : `❌ Errado — Certa: ${currentQ.question.correct_letter}`}
            </div>
            <p className="text-xs text-foreground leading-relaxed">{currentQ.question.explanation_pt}</p>
          </div>
        )}

        {/* Confirm button */}
        <button onClick={handleConfirm} disabled={!selected}
          className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {currentIdx + 1 >= actualTotal ? '🏁 Finalizar Simulado' : 'Próxima →'}
        </button>
      </main>
    </div>
  );
}
