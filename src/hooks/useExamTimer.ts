'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerState = 'idle' | 'running' | 'expired';

export type UseExamTimerReturn = {
  secondsLeft:    number;
  elapsed:        number;
  state:          TimerState;
  paused:         boolean;
  progressPct:    number;
  colorClass:     string;
  barColorClass:  string;
  formattedTime:  string;
  start:          () => void;
  reset:          () => void;
  pause:          () => void;
  resume:         () => void;
};

const TOTAL = 300; // 5 minutes

export function useExamTimer(onExpire?: () => void): UseExamTimerReturn {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL);
  const [state, setState]             = useState<TimerState>('idle');
  const [paused, setPaused]           = useState(false);
  const intervalRef                   = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef                   = useRef(onExpire);
  const secondsRef                    = useRef(TOTAL); // track without closure issues

  // Keep callback ref fresh without re-starting the interval
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  const clear = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const start = useCallback(() => {
    clear();
    setSecondsLeft(TOTAL);
    secondsRef.current = TOTAL;
    setState('running');
    setPaused(false);
    intervalRef.current = setInterval(() => {
      secondsRef.current -= 1;
      if (secondsRef.current <= 0) {
        clear();
        setState('expired');
        setSecondsLeft(0);
        onExpireRef.current?.();
      } else {
        setSecondsLeft(secondsRef.current);
      }
    }, 1000);
  }, []);

  const reset = useCallback(() => {
    clear();
    setSecondsLeft(TOTAL);
    secondsRef.current = TOTAL;
    setState('idle');
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clear();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (secondsRef.current <= 0) return;
    setPaused(false);
    intervalRef.current = setInterval(() => {
      secondsRef.current -= 1;
      if (secondsRef.current <= 0) {
        clear();
        setState('expired');
        setSecondsLeft(0);
        onExpireRef.current?.();
      } else {
        setSecondsLeft(secondsRef.current);
      }
    }, 1000);
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
    paused,
    progressPct,
    colorClass,
    barColorClass,
    formattedTime,
    start,
    reset,
    pause,
    resume,
  };
}
