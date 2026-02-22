'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EXAM_LIST } from '@/config/exams';
import type { HistoryRow } from '@/app/api/history/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ''}`;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Fácil', medium: 'Médio', hard: 'Difícil',
};

function DiffBadge({ value }: { value: string }) {
  const cls = value === 'easy'
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : value === 'medium'
      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
      : 'bg-red-500/10 text-red-400 border-red-500/20';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs border font-medium ${cls}`}>
      {DIFFICULTY_LABEL[value] ?? value}
    </span>
  );
}

function ResultBadge({ correct }: { correct: boolean }) {
  return correct
    ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Correto" />
    : <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500"   title="Errado"  />;
}

function LetterBadge({ letter, highlight }: { letter: string; highlight?: 'green' | 'red' }) {
  const cls = highlight === 'green'
    ? 'bg-green-500/10 text-green-400 border-green-500/30'
    : highlight === 'red'
      ? 'bg-red-500/10 text-red-400 border-red-500/30'
      : 'bg-secondary text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold border ${cls}`}>
      {letter}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  // Filters
  const [examId,     setExamId]     = useState('');
  const [result,     setResult]     = useState<'all' | 'correct' | 'wrong'>('all');
  const [difficulty, setDifficulty] = useState('');
  // Pagination
  const [page,       setPage]       = useState(1);
  const LIMIT = 25;
  // Data
  const [rows,       setRows]       = useState<HistoryRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), result });
      if (examId)     params.set('exam_id', examId);
      if (difficulty) params.set('difficulty', difficulty);
      const res = await fetch(`/api/history?${params}`);
      if (!res.ok) throw new Error('Falha ao carregar histórico');
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [page, examId, result, difficulty]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [examId, result, difficulty]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground text-sm transition-colors shrink-0">
            ← Dashboard
          </Link>
          <span className="text-border hidden sm:block">|</span>
          <span className="text-sm font-semibold text-foreground hidden sm:block">Histórico Completo</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico de Respostas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} questões respondidas`}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Exam */}
          <select
            value={examId}
            onChange={e => setExamId(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas as provas</option>
            {EXAM_LIST.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>

          {/* Result */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(['all', 'correct', 'wrong'] as const).map(v => (
              <button
                key={v}
                onClick={() => setResult(v)}
                className={`px-3 py-2 transition-colors ${
                  result === v
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'all' ? 'Todas' : v === 'correct' ? 'Corretas' : 'Erradas'}
              </button>
            ))}
          </div>

          {/* Difficulty */}
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Todas as dificuldades</option>
            <option value="easy">Fácil</option>
            <option value="medium">Médio</option>
            <option value="hard">Difícil</option>
          </select>

          {/* Clear filters */}
          {(examId || result !== 'all' || difficulty) && (
            <button
              onClick={() => { setExamId(''); setResult('all'); setDifficulty(''); }}
              className="text-xs text-primary hover:underline px-2"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Table — desktop */}
        {!error && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-muted-foreground font-medium min-w-[220px]">Questão</th>
                      <th className="px-4 py-3 text-left text-muted-foreground font-medium">Prova</th>
                      <th className="px-4 py-3 text-left text-muted-foreground font-medium">Tópico</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Dif.</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Sua</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Correta</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Res.</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Tempo</th>
                      <th className="px-4 py-3 text-center text-muted-foreground font-medium">Quando</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i}>
                            {Array.from({ length: 9 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <div className="h-4 bg-secondary rounded animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : rows.map((row, i) => (
                          <tr key={row.id ?? i} className={`hover:bg-secondary/20 transition-colors ${
                            row.is_correct ? 'bg-green-500/[0.02]' : 'bg-red-500/[0.02]'
                          }`}>
                            <td className="px-4 py-3 max-w-xs">
                              <span className="text-xs text-foreground line-clamp-2 leading-relaxed">
                                {row.question_text
                                  ? row.question_text.slice(0, 120) + (row.question_text.length > 120 ? '…' : '')
                                  : <span className="italic text-muted-foreground">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{row.exam_name}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px]">
                              <span className="truncate block">{row.topic}</span>
                            </td>
                            <td className="px-4 py-3 text-center"><DiffBadge value={row.difficulty} /></td>
                            <td className="px-4 py-3 text-center">
                              <LetterBadge letter={row.user_answer} highlight={row.is_correct ? 'green' : 'red'} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <LetterBadge letter={row.correct_letter} highlight="green" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <ResultBadge correct={row.is_correct} />
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-mono text-muted-foreground">
                              {fmtTime(row.time_taken_seconds)}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground whitespace-nowrap">
                              {row.timestamp}
                            </td>
                          </tr>
                        ))}
                    {!loading && rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground text-sm">
                          Nenhuma questão encontrada para esses filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
                  ))
                : rows.length === 0
                  ? <p className="text-center text-muted-foreground py-12 text-sm">Nenhuma questão encontrada.</p>
                  : rows.map((row, i) => (
                      <div key={row.id ?? i} className={`p-4 rounded-xl border text-sm space-y-2 ${
                        row.is_correct ? 'border-green-500/20 bg-green-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-foreground leading-relaxed line-clamp-2 flex-1">
                            {row.question_text?.slice(0, 100) ?? '—'}
                            {(row.question_text?.length ?? 0) > 100 ? '…' : ''}
                          </p>
                          <ResultBadge correct={row.is_correct} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="px-2 py-0.5 rounded-full bg-secondary">{row.exam_name}</span>
                          <DiffBadge value={row.difficulty} />
                          <span>Sua: <LetterBadge letter={row.user_answer} highlight={row.is_correct ? 'green' : 'red'} /></span>
                          {!row.is_correct && <span>Certa: <LetterBadge letter={row.correct_letter} highlight="green" /></span>}
                          <span className="ml-auto font-mono">{fmtTime(row.time_taken_seconds)}</span>
                          <span>{row.timestamp}</span>
                        </div>
                      </div>
                    ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} registros
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    ← Anterior
                  </button>
                  {/* Page numbers — show a window around current page */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…'
                        ? <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">…</span>
                        : <button
                            key={p}
                            onClick={() => setPage(p)}
                            disabled={loading}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              p === page
                                ? 'bg-primary text-primary-foreground font-medium'
                                : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                            }`}
                          >{p}</button>
                    )}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    className="px-3 py-1.5 rounded-lg bg-secondary text-sm disabled:opacity-40 hover:bg-secondary/80 transition-colors"
                  >
                    Próxima →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
