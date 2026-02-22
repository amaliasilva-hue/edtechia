'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

type EvolutionRow = {
  week_start:   string;
  exam_name:    string;
  total:        number;
  correct:      number;
  accuracy_pct: number;
};

type Props = {
  data: EvolutionRow[];
};

// Each week becomes a row; each exam becomes a Line
// { week: '2026-01-13', 'gcp-security-engineer': 72, 'gcp-cloud-architect': 55, ... }
type ChartRow = Record<string, string | number>;

const COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#34d399',
  '#f87171', '#a78bfa', '#fb923c', '#4ade80',
];

export function EvolutionChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
        Sem dados de evolução ainda. Responda questões durante pelo menos 2 semanas para ver o gráfico.
      </div>
    );
  }

  // Get all unique exams
  const exams = Array.from(new Set(data.map((r) => r.exam_name)));

  // Get all unique weeks sorted
  const weeks = Array.from(new Set(data.map((r) => r.week_start))).sort();

  // Build chart rows
  const chartData: ChartRow[] = weeks.map((week) => {
    const row: ChartRow = { week: week.slice(5) }; // show MM-DD
    for (const exam of exams) {
      const match = data.find((r) => r.week_start === week && r.exam_name === exam);
      if (match) row[exam] = match.accuracy_pct;
    }
    return row;
  });

  // Shorten exam names for legend
  const shortName = (s: string) =>
    s.replace('gcp-', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="week"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#334155' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#e2e8f0' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [`${value ?? 0}%`, shortName(String(name ?? ''))]}
        />
        <Legend
          formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{shortName(value)}</span>}
        />
        <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.4} />
        {exams.map((exam, i) => (
          <Line
            key={exam}
            type="monotone"
            dataKey={exam}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
            connectNulls
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
