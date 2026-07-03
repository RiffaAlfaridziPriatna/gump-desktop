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
