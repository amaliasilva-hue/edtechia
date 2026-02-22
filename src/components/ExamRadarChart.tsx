'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

type ExamAccuracyRow = {
  exam_name:    string;
  total:        number;
  correct:      number;
  accuracy_pct: number;
};

type Props = {
  data: ExamAccuracyRow[];
};

const shortName = (s: string) =>
  s.replace('gcp-', '')
   .replace(/-/g, ' ')
   .split(' ')
   .map((w) => w.charAt(0).toUpperCase() + w.slice(1, 4))
   .join(' ');

export function ExamRadarChart({ data }: Props) {
  if (!data || data.length < 2) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
        Responda questões em pelo menos 2 provas para ver o radar.
      </div>
    );
  }

  const chartData = data.map((row) => ({
    exam:     shortName(row.exam_name),
    fullName: row.exam_name,
    accuracy: row.accuracy_pct,
    total:    row.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="exam"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={(v) => `${v}%`}
          tickCount={4}
          axisLine={false}
        />
        <Radar
          dataKey="accuracy"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.25}
          strokeWidth={2}
          dot={{ r: 3, fill: '#6366f1' }}
        />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, props: any) => [
            `${value}% (${props?.payload?.total ?? 0} questões)`,
            props?.payload?.fullName ?? '',
          ]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
