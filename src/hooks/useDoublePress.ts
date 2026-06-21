import {useCallback, useRef} from 'react';

const DEFAULT_DELAY_MS = 250;

export function useDoublePress(
  onSinglePress: () => void,
  onDoublePress: () => void,
  delay = DEFAULT_DELAY_MS,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressRef = useRef(0);

  return useCallback(() => {
    const now = Date.now();

    if (now - lastPressRef.current < delay) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastPressRef.current = 0;
      onDoublePress();
      return;
    }

    lastPressRef.current = now;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSinglePress();
    }, delay);
  }, [delay, onDoublePress, onSinglePress]);
}
