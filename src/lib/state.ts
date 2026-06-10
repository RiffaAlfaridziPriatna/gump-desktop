import {useRef, useReducer, useEffect, Dispatch} from 'react';
import {immer} from 'zustand/middleware/immer';
import {useShallow} from 'zustand/shallow';
import {StoreApi, StoreMutators, createStore, useStore} from 'zustand';

export type StateStore<State> = StoreMutators<
  StoreApi<State>,
  object
>['zustand/immer'];

export function createStateStore<State>(
  initialState: State,
): StateStore<State> {
  return createStore<State>()(immer(() => initialState));
}

export function useStateStore<S, R = S>(
  store: StateStore<S>,
  selector?: (state: S) => R,
): R {
  return useStore(
    store,
    useShallow(state => (selector ? selector(state) : (state as unknown as R))),
  );
}

export function useTimedState<T>(
  defaultValue: T,
  duration = 2500,
): [T, Dispatch<T>] {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [value, setValue] = useReducer((state: T, update: T) => {
    if (update === defaultValue) return defaultValue;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = setTimeout(() => setValue(defaultValue), duration);
    return update;
  }, defaultValue);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return [value, setValue];
}
