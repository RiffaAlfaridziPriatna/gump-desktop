import {useEffect, useRef, useState} from 'react';

export function useThrottledValue<T>(value: T, delayMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const latestRef = useRef(value);
  latestRef.current = value;

  useEffect(() => {
    const timer = setTimeout(() => {
      setThrottled(latestRef.current);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return throttled;
}
