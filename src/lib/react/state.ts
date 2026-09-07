import {immer} from 'zustand/middleware/immer';
import {shallow} from 'zustand/shallow';
import {useStoreWithEqualityFn} from 'zustand/traditional';
import {StoreApi, StoreMutators, createStore} from 'zustand';

export type StateStore<State> = StoreMutators<
  StoreApi<State>,
  object
>['zustand/immer'];

export type VanillaSetState<State> = {
  (
    partial:
      | State
      | Partial<State>
      | ((state: State) => State | Partial<State> | void),
    replace?: false,
  ): void;
  (state: State | ((state: State) => State), replace: true): void;
};

export type VanillaStateStore<State> = Omit<StoreApi<State>, 'setState'> & {
  setState: VanillaSetState<State>;
};

type SubscribableStore<State> = Pick<
  StoreApi<State>,
  'getState' | 'getInitialState' | 'subscribe'
>;

export function createStateStore<State>(
  initialState: State,
): StateStore<State> {
  return createStore<State>()(immer(() => initialState));
}

/**
 * Zustand store without Immer. Function updaters that return `undefined`
 * mutate in place and do not notify subscribers — so a Record's identity
 * stays stable. Return a partial (or a new root) when subscribers must run.
 */
export function createVanillaStateStore<State>(
  initialState: State,
): VanillaStateStore<State> {
  const store = createStore<State>()(() => initialState);
  const nativeSetState = store.setState.bind(store);

  const setState: VanillaSetState<State> = ((
    partial:
      | State
      | Partial<State>
      | ((state: State) => State | Partial<State> | void),
    replace?: boolean,
  ) => {
    if (typeof partial !== 'function') {
      nativeSetState(partial as State | Partial<State>, replace as false);
      return;
    }

    const current = store.getState();
    const updater = partial as (state: State) => State | Partial<State> | void;
    const next = updater(current);
    if (next === undefined) {
      return;
    }

    nativeSetState(next as State | Partial<State>, replace as false);
  }) as VanillaSetState<State>;

  store.setState = setState as StoreApi<State>['setState'];
  return store as VanillaStateStore<State>;
}

export function useStateStore<S, R = S>(
  store: SubscribableStore<S>,
  selector?: (state: S) => R,
): R {
  return useStoreWithEqualityFn(
    store as StoreApi<S>,
    selector ? (state: S) => selector(state) : (state: S) => state as unknown as R,
    shallow,
  );
}
