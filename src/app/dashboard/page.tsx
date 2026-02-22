'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { EXAM_LIST } from '@/config/exams';
import CloudDojoLogo from '@/components/CloudDojoLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { EvolutionChart } from '@/components/EvolutionChart';
import { ExamRadarChart } from '@/components/ExamRadarChart';

type InsightsData = {
  overall_accuracy:  number;
  total_questions:   number;
  correct_answers:   number;
  avg_time_seconds:  number | null;
  total_timeouts:    number;
  accuracy_by_exam:  Array<{
    exam_name:        string;
    total:            number;
    correct:          number;
    accuracy_pct:     number;
    avg_time_seconds: number | null;
  }>;
  accuracy_by_topic: Array<{
    exam_name:        string;
    topic:            string;
    total:            number;
    correct:          number;
    accuracy_pct:     number;
    avg_time_seconds: number | null;
    timeouts:         number;
  }>;
  accuracy_by_difficulty: Array<{
    difficulty:   string;
    total:        number;
    correct:      number;
    accuracy_pct: number;
  }>;
  accuracy_evolution: Array<{
    week_start:   string;
    exam_name:    string;
    total:        number;
    correct:      number;
    accuracy_pct: number;
  }>;
  spaced_repetition: Array<{
    exam_name:       string;
    topic:           string;
    accuracy_pct:    number;
    total:           number;
    days_since_last: number;
    last_practice:   string;
  }>;
  ai_quality: Array<{
    gemini_model_used: string;
    thumbs_up:         number;
    thumbs_down:       number;
    total_rated:       number;
  }>;
  recent_activity: Array<{
    exam_name:          string;
    topic:              string;
    difficulty:         string;
    question_text:      string | null;
    user_answer:        string;
    correct_letter:     string;
    is_correct:         boolean;
    time_taken_seconds: number | null;
    timestamp:          string;
  }>;
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const res = await fetch('/api/insights');
        if (!res.ok) throw new Error('Failed to load insights');
        const data = await res.json();
        setInsights(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CloudDojoLogo size="sm" />
          </div>
          {/* Nav links — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-4">
            <Link href="/simulado"
              className="text-xs font-medium text-primary hover:underline transition-colors">
              Simulado
            </Link>
            <Link href="/review"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Revisar Erros
            </Link>
            <Link href="/history"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Histórico
            </Link>
            <Link href="/admin/upload"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Admin
            </Link>
          </div>
          {/* Right: always visible actions */}
          <div className="flex items-center gap-2">
            {/* Mobile nav shortcuts */}
            <div className="flex sm:hidden items-center gap-1">
              <Link href="/simulado" className="text-xs px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary font-medium">Simulado</Link>
              <Link href="/review" className="text-xs px-2.5 py-1.5 rounded-lg bg-secondary text-muted-foreground">Erros</Link>
            </div>
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[160px]">{session?.user?.email}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-xs bg-secondary px-3 py-1.5 rounded-lg hover:bg-secondary/80 transition-colors whitespace-nowrap"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Your performance analytics and exam history</p>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-28 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
            {error}
          </div>
        ) : insights && (
          <>
            {/* ── Spaced Repetition Alert ── */}
            {insights.spaced_repetition.length > 0 && (
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-blue-400">Tópicos para revisar — não praticados há 3+ dias</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {insights.spaced_repetition.map((t, i) => (
                    <Link key={i} href={`/exam/${t.exam_name}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors">
                      <span className="text-xs text-blue-300 truncate max-w-[130px]">{t.topic}</span>
                      <span className="text-xs text-orange-400 font-bold shrink-0">{t.days_since_last}d</span>
                      <span className="text-xs text-muted-foreground shrink-0">{t.accuracy_pct}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── Weak Topic Alert ── */}
            {(() => {
              const weak = insights.accuracy_by_topic.filter(t => t.accuracy_pct < 60 && t.total >= 3);
              if (weak.length === 0) return null;
              return (
                <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                    <span className="text-sm font-semibold text-yellow-400">Tópicos que precisam de reforço</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {weak.slice(0, 5).map((t, i) => (
                      <Link key={i} href={`/exam/${t.exam_name}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 transition-colors">
                        <span className="text-xs text-yellow-300 truncate max-w-[140px]">{t.topic}</span>
                        <span className="text-xs font-bold text-red-400 shrink-0">{t.accuracy_pct}%</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Global Stats ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Acurácia Geral"
                value={`${insights.overall_accuracy}%`}
                sub={`${insights.correct_answers} / ${insights.total_questions} corretas`}
                color={insights.overall_accuracy >= 70 ? 'green' : insights.overall_accuracy >= 50 ? 'yellow' : 'red'}
              />
              <StatCard
                label="Questões Respondidas"
                value={String(insights.total_questions)}
                sub="em todas as provas"
                color="blue"
              />
              <StatCard
                label="Tempo Médio"
                value={insights.avg_time_seconds != null ? formatSeconds(insights.avg_time_seconds) : '—'}
                sub={`${insights.total_timeouts} timeout${insights.total_timeouts !== 1 ? 's' : ''}`}
                color="yellow"
              />
              <StatCard
                label="AI Quality (RLHF)"
                value={insights.ai_quality.reduce((a, b) => a + b.thumbs_up, 0) +
                       ' / ' +
                       insights.ai_quality.reduce((a, b) => a + b.thumbs_down, 0)}
                sub={`${insights.ai_quality.reduce((a, b) => a + b.total_rated, 0)} questões avaliadas`}
                color="purple"
              />
            </div>

            {/* ── Difficulty Breakdown ── */}
            {insights.accuracy_by_difficulty.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">Questões por Dificuldade</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(['easy', 'medium', 'hard'] as const).map((d) => {
                    const row = insights.accuracy_by_difficulty.find(r => r.difficulty === d);
                    const label  = d === 'easy' ? 'Fácil' : d === 'medium' ? 'Médio' : 'Difícil';
                    const dotCls = d === 'easy' ? 'bg-green-500' : d === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
                    const colorBar = d === 'easy' ? 'bg-green-500' : d === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <div key={d} className="p-5 rounded-xl border border-border bg-card space-y-3">
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                            <span className="text-sm font-semibold text-foreground">{label}</span>
                          </div>
                          {row ? <AccuracyBadge value={row.accuracy_pct} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                        {row ? (
                          <>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${row.accuracy_pct}%` }} />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.correct} corretas de {row.total} questões ({row.accuracy_pct}%)
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">Nenhuma questão respondida ainda</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Per Exam Accuracy ── */}
            {insights.accuracy_by_exam.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">Resultado por Prova</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {insights.accuracy_by_exam.map((exam) => (
                    <div key={exam.exam_name} className="p-5 rounded-xl border border-border bg-card space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground truncate pr-2">{exam.exam_name}</span>
                        <AccuracyBadge value={exam.accuracy_pct} />
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            exam.accuracy_pct >= 70 ? 'bg-green-500' :
                            exam.accuracy_pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${exam.accuracy_pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{exam.correct} corretas de {exam.total} questões</span>
                        {exam.avg_time_seconds != null && (
                          <span className="font-mono">{formatSeconds(exam.avg_time_seconds)} médio</span>
                        )}
                      </div>
                      {/* Topics for this exam */}
                      {insights.accuracy_by_topic.filter(t => t.exam_name === exam.exam_name).length > 0 && (
                        <details className="group">
                          <summary className="text-xs text-primary cursor-pointer hover:underline select-none">
                            Ver tópicos →
                          </summary>
                          <div className="mt-2 space-y-1.5">
                            {insights.accuracy_by_topic
                              .filter(t => t.exam_name === exam.exam_name)
                              .sort((a, b) => a.accuracy_pct - b.accuracy_pct)
                              .map((t, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground truncate flex-1">{t.topic}</span>
                                  <AccuracyBadge value={t.accuracy_pct} />
                                  <span className="text-xs text-muted-foreground w-14 text-right font-mono">
                                    {t.correct}/{t.total}
                                  </span>
                                  {t.timeouts > 0 && (
                                    <span className="text-xs text-red-400">{t.timeouts} timeout</span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Evolution Chart + Radar ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl border border-border bg-card">
                <h2 className="text-sm font-semibold text-foreground mb-4">Evolução de Acurácia (por semana)</h2>
                <EvolutionChart data={insights.accuracy_evolution} />
              </div>
              <div className="p-5 rounded-xl border border-border bg-card">
                <h2 className="text-sm font-semibold text-foreground mb-4">Comparação entre Provas</h2>
                <ExamRadarChart data={insights.accuracy_by_exam} />
              </div>
            </div>

            {/* ── Start Exam Buttons ── */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-3">Escolha uma Prova</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {EXAM_LIST.map((exam) => {
                  const examStats = insights.accuracy_by_exam.find(e => e.exam_name === exam.id);
                  return (
                    <Link key={exam.id} href={`/exam/${exam.id}`}
                      className="group p-4 rounded-xl border border-border bg-card
                                 hover:border-primary/50 hover:bg-primary/5 transition-all duration-150">
                      <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {exam.title}
                      </div>
                      {examStats ? (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                examStats.accuracy_pct >= 70 ? 'bg-green-500' :
                                examStats.accuracy_pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${examStats.accuracy_pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{examStats.accuracy_pct}%</span>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground mt-1">Ainda não iniciado →</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── Recent Activity (detailed) ── */}
            {insights.recent_activity.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-foreground">Últimas Respostas</h2>
                  <Link href="/history" className="text-xs text-primary hover:underline">Ver histórico completo →</Link>
                </div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-muted-foreground font-medium min-w-[220px]">Questão</th>
                          <th className="px-4 py-3 text-left text-muted-foreground font-medium">Tópico</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Dif.</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Sua resp.</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Correta</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Resultado</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Tempo</th>
                          <th className="px-4 py-3 text-center text-muted-foreground font-medium">Quando</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {insights.recent_activity.map((row, i) => (
                          <tr key={i} className={`hover:bg-secondary/20 transition-colors ${
                            row.is_correct ? 'bg-green-500/3' : 'bg-red-500/3'
                          }`}>
                            <td className="px-4 py-3 text-xs text-foreground max-w-xs">
                              <span className="line-clamp-2 leading-relaxed">
                                {row.question_text
                                  ? row.question_text.slice(0, 120) + (row.question_text.length > 120 ? '…' : '')
                                  : <span className="text-muted-foreground italic">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{row.topic}</td>
                            <td className="px-4 py-3 text-center">
                              <DifficultyBadge value={row.difficulty} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <AnswerBadge letter={row.user_answer} isCorrect={row.user_answer === row.correct_letter} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <AnswerBadge letter={row.correct_letter} isCorrect={true} alwaysGreen />
                            </td>
                            <td className="px-4 py-3 text-center">
                              {row.is_correct
                                ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                                : <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />}
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-mono text-muted-foreground">
                              {row.time_taken_seconds != null
                                ? row.time_taken_seconds >= 300
                                  ? <span className="text-red-400 text-xs">Timeout</span>
                                  : formatSeconds(row.time_taken_seconds)
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-muted-foreground whitespace-nowrap">{row.timestamp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── AI Quality (RLHF) ── */}
            {insights.ai_quality.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">Qualidade da IA por Modelo</h2>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-muted-foreground font-medium">Modelo</th>
                        <th className="px-4 py-3 text-center text-muted-foreground font-medium">Positivo</th>
                        <th className="px-4 py-3 text-center text-muted-foreground font-medium">Negativo</th>
                        <th className="px-4 py-3 text-center text-muted-foreground font-medium">Total Avaliado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {insights.ai_quality.map((row, i) => (
                        <tr key={i} className="bg-card hover:bg-secondary/20 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-primary">{row.gemini_model_used}</td>
                          <td className="px-4 py-3 text-center text-green-400">{row.thumbs_up}</td>
                          <td className="px-4 py-3 text-center text-red-400">{row.thumbs_down}</td>
                          <td className="px-4 py-3 text-center text-muted-foreground">{row.total_rated}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}) {
  const colorMap = {
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    red:    'text-red-400',
    blue:   'text-blue-400',
    purple: 'text-purple-400',
  };
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color]} mt-1`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function AccuracyBadge({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-green-500/10 text-green-400' :
                value >= 50 ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {value}%
    </span>
  );
}

function DifficultyBadge({ value }: { value: string }) {
  const color = value === 'hard'   ? 'bg-red-500/10 text-red-400' :
                value === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                                     'bg-green-500/10 text-green-400';
  const label = value === 'hard' ? 'Difícil' : value === 'medium' ? 'Médio' : 'Fácil';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function AnswerBadge({ letter, isCorrect, alwaysGreen }: { letter: string; isCorrect: boolean; alwaysGreen?: boolean }) {
  const color = alwaysGreen
    ? 'bg-green-500/10 text-green-400 border-green-500/30'
    : isCorrect
      ? 'bg-green-500/10 text-green-400 border-green-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold border ${color}`}>
      {letter}
    </span>
  );
}
