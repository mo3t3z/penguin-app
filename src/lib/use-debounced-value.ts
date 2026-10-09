import { useEffect, useState } from 'react';

// Follows `value` once it has stopped changing for `delayMs`. While paused it keeps
// the last value it reached and catches up after the pause ends.
export function useDebouncedValue<T>(value: T, delayMs: number, paused = false) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, paused, value]);
  return debounced;
}
