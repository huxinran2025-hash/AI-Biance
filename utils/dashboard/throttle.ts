import { useEffect, useRef, useState } from 'react';

export function useThrottledValue<T>(value: T, waitMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const timeoutRef = useRef<number | null>(null);
  const lastExecutedRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecutedRef.current;

    if (elapsed >= waitMs) {
      lastExecutedRef.current = now;
      setThrottled(value);
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      lastExecutedRef.current = Date.now();
      setThrottled(value);
      timeoutRef.current = null;
    }, waitMs - elapsed) as unknown as number;

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, waitMs]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return throttled;
}

