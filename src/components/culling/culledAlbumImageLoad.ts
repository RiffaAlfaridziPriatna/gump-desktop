import {
  createContext,
  useContext,
  useSyncExternalStore,
} from 'react';

export type CulledAlbumImageLoadStore = {
  getIds: () => ReadonlySet<string>;
  setIds: (ids: Set<string>) => void;
  subscribe: (listener: () => void) => () => void;
  has: (photoId: string) => boolean;
};

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function createCulledAlbumImageLoadStore(
  initialIds: string[] = [],
): CulledAlbumImageLoadStore {
  let ids: ReadonlySet<string> = new Set(initialIds);
  const listeners = new Set<() => void>();

  return {
    getIds: () => ids,
    setIds: next => {
      // Bail when membership unchanged — avoids waking every mounted
      // thumbnail on every viewability tick during fling.
      if (setsEqual(ids, next)) {
        return;
      }
      ids = next;
      listeners.forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    has: photoId => ids.has(photoId),
  };
}

export const CulledAlbumImageLoadContext =
  createContext<CulledAlbumImageLoadStore | null>(null);

export function useShouldLoadCulledAlbumImage(photoId: string): boolean {
  const store = useContext(CulledAlbumImageLoadContext);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => undefined),
    () => (store ? store.has(photoId) : true),
    () => true,
  );
}
