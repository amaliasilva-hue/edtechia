'use client';

/**
 * QuestionCard — renders a generated question with:
 *  • Mermaid diagram (topology/architecture evidence)   → type: 'mermaid'
 *  • Mock terminal window (CLI/log/error evidence)      → type: 'terminal'
 *  • Plain question text                               → type: 'none'
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { VisualContext } from '@/lib/vertexai';

// ─── Mermaid (lazy-loaded, client-only) ────────────────────────────────────

function MermaidDiagram({ code }: { code: string }) {
  const id      = useId().replace(/:/g, '');
  const ref     = useRef<HTMLDivElement>(null);
  const [svg, setSvg]     = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          // Make background transparent so Tailwind class controls it
          themeVariables: {
            background: 'transparent',
            primaryColor: '#6366f1',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#6366f1',
            lineColor: '#94a3b8',
            secondaryColor: '#1e293b',
            tertiaryColor: '#334155',
          },
        });

        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Diagram error');
      }
    })();

    return () => { cancelled = true; };
  }, [code, id]);

  if (error) {
    return (
      <pre className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/20 rounded-lg p-3 overflow-x-auto">
        ⚠ Mermaid parse error: {error}
        {'\n\n'}
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="w-full overflow-x-auto rounded-xl bg-slate-900/80 border border-slate-700 p-4 my-3"
    >
      {svg
        ? <div dangerouslySetInnerHTML={{ __html: svg }} className="flex justify-center [&>svg]:max-w-full [&>svg]:h-auto" />
        : <div className="flex items-center justify-center h-20 text-xs text-slate-500">
            <span className="w-4 h-4 border-2 border-slate-500/30 border-t-slate-400 rounded-full animate-spin mr-2" />
            Rendering diagram...
          </div>
      }
    </div>
  );
}

// ─── Terminal Window ────────────────────────────────────────────────────────

function TerminalWindow({ content }: { content: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-slate-700 font-mono text-sm my-3 shadow-2xl">
      {/* macOS-style title bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 border-b border-slate-700">
        <span className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500" />
        <span className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500" />
        <span className="ml-auto text-xs text-slate-500 select-none">bash — gcloud</span>
      </div>
      {/* Terminal body */}
      <pre className="bg-slate-900 text-green-400 p-4 overflow-x-auto leading-relaxed whitespace-pre text-xs max-h-72 scrollbar-thin scrollbar-thumb-slate-700">
        {content}
      </pre>
    </div>
  );
}

// ─── Visual Context router ──────────────────────────────────────────────────

function VisualContextBlock({ vc }: { vc: VisualContext }) {
  if (!vc || vc.type === 'none' || !vc.content?.trim()) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
          {vc.type === 'mermaid' ? 'Diagrama de Topologia' : 'Saída do Terminal'}
        </span>
        <span className="text-xs text-slate-500 italic">
          (forensic evidence — does not reveal the answer)
        </span>
      </div>
      {vc.type === 'mermaid'
        ? <MermaidDiagram code={vc.content} />
        : <TerminalWindow content={vc.content} />
      }
    </div>
  );
}

// ─── Option Button ──────────────────────────────────────────────────────────

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

function getOptionStyle(
  letter: string,
  selected: string | null,
  correctLetter: string
): string {
  const base = 'w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-150 ';
  if (!selected) {
    return base + 'border-border bg-secondary/30 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]';
  }
  if (letter === correctLetter) {
    return base + 'border-green-500 bg-green-500/10 text-green-300';
  }
  if (letter === selected) {
    return base + 'border-red-500 bg-red-500/10 text-red-300';
  }
  return base + 'border-border bg-secondary/20 text-muted-foreground opacity-50';
}

// ─── Props ──────────────────────────────────────────────────────────────────

export type QuestionData = {
  question_en: string;
  visual_context: VisualContext;
  options_en: { A: string; B: string; C: string; D: string };
  correct_letter: 'A' | 'B' | 'C' | 'D';
  explanation_pt: string;
};

export type QuestionCardProps = {
  question:   QuestionData;
  modelUsed:  string;
  topicName:  string;
  difficulty: string;
  ragChunks:  number;
  selected:   string | null;
  onAnswer:   (letter: string) => void;
  // Timer
  timerFormatted:  string;
  timerProgressPct: number;
  timerColorClass:  string;
  timerBarClass:    string;
  timerState:       'idle' | 'running' | 'expired';
  // Gamification
  streak:     number;
  studyMode:  boolean;
  // RLHF
  rating:          number | null;
  onRate:          (v: 1 | -1) => void;
  onReport:        () => void;
  showReport:      boolean;
  reportText:      string;
  onReportChange:  (v: string) => void;
  onReportSubmit:  () => void;
  onNext:          () => void;
};

// ─── QuestionCard ───────────────────────────────────────────────────────────

export function QuestionCard({
  question,
  modelUsed,
  topicName,
  difficulty,
  ragChunks,
  selected,
  onAnswer,
  timerFormatted,
  timerProgressPct,
  timerColorClass,
  timerBarClass,
  timerState,
  streak,
  studyMode,
  rating,
  onRate,
  onReport,
  showReport,
  reportText,
  onReportChange,
  onReportSubmit,
  onNext,
}: QuestionCardProps) {
  const answerState = selected
    ? selected === question.correct_letter ? 'correct' : 'incorrect'
    : 'idle';

  return (
    <div className="space-y-4">
      {/* Timer bar — hidden in study mode */}
      {!studyMode && timerState !== 'idle' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs text-muted-foreground">Tempo restante</span>
            <span className={`text-sm font-mono font-semibold tabular-nums ${timerColorClass}`}>
              {timerState === 'expired' ? '0:00' : timerFormatted}
            </span>
          </div>
          <div className="h-1.5 bg-secondary w-full">
            <div
              className={`h-full transition-all duration-1000 ${timerBarClass}`}
              style={{ width: `${timerState === 'expired' ? 0 : timerProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Timeout banner */}
      {!studyMode && timerState === 'expired' && (
        <div className="p-4 rounded-xl border border-red-500/50 bg-red-500/10">
          <p className="text-red-400 font-semibold text-sm">Tempo esgotado — Resposta certa: {question.correct_letter}</p>
        </div>
      )}

      {/* Metadata badges + streak */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        {studyMode && (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Modo Estudo</span>
        )}
        {streak >= 2 && (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-semibold tabular-nums">
            {streak} seguidas
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
          {modelUsed}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-secondary">{topicName}</span>
        <span className="px-2 py-0.5 rounded-full bg-secondary capitalize">{difficulty}</span>
        {ragChunks > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
            {ragChunks} RAG
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="p-6 rounded-xl border border-border bg-card">
        <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap font-mono">
          {question.question_en}
        </p>

        {/* Visual context (Mermaid or Terminal) — shown BELOW question text */}
        <VisualContextBlock vc={question.visual_context} />
      </div>

      {/* Answer options */}
      <div className="space-y-2">
        {OPTION_KEYS.map((letter) => (
          <button
            key={letter}
            onClick={() => onAnswer(letter)}
            disabled={!!selected}
            className={getOptionStyle(letter, selected, question.correct_letter)}
          >
            <span className="font-semibold mr-3 font-mono">{letter}.</span>
            {question.options_en[letter]}
          </button>
        ))}
      </div>

      {/* Result banner */}
      {answerState !== 'idle' && (
        <div className={`p-4 rounded-xl border ${
          answerState === 'correct'
            ? 'border-green-500/50 bg-green-500/10'
            : 'border-red-500/50 bg-red-500/10'
        }`}>
          <p className={`font-semibold text-sm ${
            answerState === 'correct' ? 'text-green-400' : 'text-red-400'
          }`}>
            {answerState === 'correct'
              ? 'Correto!'
              : `Incorreto — Resposta certa: ${question.correct_letter}`}
          </p>
        </div>
      )}

      {/* Explanation */}
      {selected && (
        <div className="p-5 rounded-xl border border-border bg-secondary/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Explicação (PT)
          </h3>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {question.explanation_pt}
          </p>
        </div>
      )}

      {/* RLHF feedback */}
      {selected && (
        <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-muted-foreground">Rate this question:</span>
          <div className="flex items-center gap-2">
            <button onClick={() => onRate(1)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                rating === 1
                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}>
              Positivo
            </button>
            <button onClick={() => onRate(-1)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                rating === -1
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}>
              Negativo
            </button>
            <button onClick={onReport}
              className="px-3 py-1.5 rounded-lg text-sm bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              Reportar
            </button>
          </div>
        </div>
      )}

      {/* Report form */}
      {showReport && (
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <label className="text-xs text-muted-foreground">
            Describe the issue (e.g. &quot;wrong answer&quot;, &quot;deprecated service&quot;):
          </label>
          <textarea
            value={reportText}
            onChange={(e) => onReportChange(e.target.value)}
            rows={3}
            placeholder="What's wrong with this question?"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <button onClick={onReportSubmit}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
            Submit Report
          </button>
        </div>
      )}

      {/* Next question trigger */}
      {selected && (
        <button onClick={onNext}
          className="w-full py-3 rounded-xl border border-dashed border-border text-muted-foreground text-sm hover:border-primary/50 hover:text-foreground transition-all">
          Próxima Questão →
        </button>
      )}
    </div>
  );
}
