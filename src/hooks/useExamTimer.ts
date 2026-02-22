'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerState = 'idle' | 'running' | 'expired';

export type UseExamTimerReturn = {
  secondsLeft:    number;
  elapsed:        number;       // seconds since timer started
  state:          TimerState;
  progressPct:    number;       // 0–100, decreasing
  colorClass:     string;       // tailwind text color
  barColorClass:  string;       // tailwind bg color for progress bar
  formattedTime:  string;       // "4:32"
  start:          () => void;
  reset:          () => void;
};

const TOTAL = 300; // 5 minutes

export function useExamTimer(onExpire?: () => void): UseExamTimerReturn {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL);
  const [state, setState]             = useState<TimerState>('idle');
  const intervalRef                   = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef                   = useRef(onExpire);

  // Keep callback ref fresh without re-starting the interval
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const clear = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const start = useCallback(() => {
    clear();
    setSecondsLeft(TOTAL);
    setState('running');
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clear();
          setState('expired');
          onExpireRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    clear();
    setSecondsLeft(TOTAL);
    setState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clear(), []);

  const elapsed      = TOTAL - secondsLeft;
  const progressPct  = Math.round((secondsLeft / TOTAL) * 100);

  // Color thresholds: >60% green, >30% yellow, ≤30% red
  const colorClass = progressPct > 60
    ? 'text-emerald-400'
    : progressPct > 30
      ? 'text-amber-400'
      : 'text-red-400';

  const barColorClass = progressPct > 60
    ? 'bg-emerald-500'
    : progressPct > 30
      ? 'bg-amber-500'
      : 'bg-red-500';

  const minutes       = Math.floor(secondsLeft / 60);
  const seconds       = secondsLeft % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return {
    secondsLeft,
    elapsed,
    state,
    progressPct,
    colorClass,
    barColorClass,
    formattedTime,
    start,
    reset,
  };
}
