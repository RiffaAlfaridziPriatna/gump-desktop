import {immer} from 'zustand/middleware/immer';
import {shallow} from 'zustand/shallow';
import {useStoreWithEqualityFn} from 'zustand/traditional';
import {StoreApi, StoreMutators, createStore} from 'zustand';

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
  return useStoreWithEqualityFn(
    store,
    selector ? (state: S) => selector(state) : (state: S) => state as unknown as R,
    shallow,
  );
}
