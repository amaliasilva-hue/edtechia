'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EXAM_LIST } from '@/config/exams';
import type { WrongAnswer } from '@/app/api/wrong-answers/route';

function DifficultyBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    easy:   'bg-green-500/10 text-green-400',
    medium: 'bg-yellow-500/10 text-yellow-400',
    hard:   'bg-red-500/10 text-red-400',
  };
  const label: Record<string, string> = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[value] ?? 'bg-secondary text-muted-foreground'}`}>
      {label[value] ?? value}
    </span>
  );
}

export default function ReviewPage() {
  const [examFilter, setExamFilter] = useState('');
  const [data,       setData]       = useState<WrongAnswer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = examFilter
      ? `/api/wrong-answers?exam_id=${encodeURIComponent(examFilter)}&limit=50`
      : `/api/wrong-answers?limit=50`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d.wrong_answers ?? []); setLoading(false); })
      .catch(() => { setError('Falha ao carregar as questões.'); setLoading(false); });
  }, [examFilter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm transition-colors">← Dashboard</Link>
          <span className="text-border">|</span>
          <span className="text-sm font-semibold text-foreground">📋 Revisar Erros</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deck de Erros</h1>
          <p className="text-muted-foreground text-sm mt-1">Questões que você errou, com explicação completa</p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">Filtrar por prova:</span>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas as provas</option>
            {EXAM_LIST.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">{error}</div>
        ) : data.length === 0 ? (
          <div className="p-8 rounded-xl border border-border bg-card text-center">
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-lg font-semibold text-foreground">Nenhum erro encontrado!</h2>
            <p className="text-muted-foreground text-sm mt-1">
              {examFilter ? 'Nenhum erro para esta prova.' : 'Você não errou nenhuma questão ainda.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{data.length} questão(ões) errada(s)</p>
            <div className="space-y-4">
              {data.map((item) => (
                <div key={item.id} className="p-5 rounded-xl border border-red-500/20 bg-card space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground">{item.exam_name}</span>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-xs text-muted-foreground">{item.topic}</span>
                    <DifficultyBadge value={item.difficulty} />
                    <span className="text-xs text-muted-foreground ml-auto">{item.timestamp}</span>
                  </div>

                  {/* Question */}
                  {item.question_text && (
                    <div className="p-4 rounded-lg bg-secondary/40 border border-border">
                      <p className="text-sm text-foreground leading-relaxed font-mono whitespace-pre-wrap">
                        {item.question_text}
                      </p>
                    </div>
                  )}

                  {/* Answers */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Sua resposta:</span>
                      <span className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 font-bold text-sm border border-red-500/30">
                        {item.user_answer}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs">→</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">Certa:</span>
                      <span className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 font-bold text-sm border border-green-500/30">
                        {item.correct_letter}
                      </span>
                    </div>
                  </div>

                  {/* Explanation */}
                  {item.explanation_pt && (
                    <details>
                      <summary className="text-xs text-primary cursor-pointer hover:underline select-none font-medium">
                        📖 Ver explicação completa
                      </summary>
                      <div className="mt-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                          {item.explanation_pt}
                        </p>
                      </div>
                    </details>
                  )}

                  {/* Practice again button */}
                  <Link
                    href={`/exam/${item.exam_name}`}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                  >
                    ⚡ Praticar este tópico →
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
