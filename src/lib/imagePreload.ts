import {Image} from 'react-native';
import {loadImageDimensions} from './imageDimensions';

const DEFAULT_CONCURRENCY = 4;

const prefetchedUris = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export function isImagePreloaded(uri: string): boolean {
  return prefetchedUris.has(uri);
}

export function preloadImage(uri: string): Promise<void> {
  if (!uri) {
    return Promise.resolve();
  }

  if (prefetchedUris.has(uri)) {
    return Promise.resolve();
  }

  const existing = inflight.get(uri);
  if (existing) {
    return existing;
  }

  const promise = Promise.all([
    loadImageDimensions(uri),
    Image.prefetch(uri).catch(() => undefined),
  ])
    .then(() => {
      prefetchedUris.add(uri);
    })
    .finally(() => {
      inflight.delete(uri);
    });

  inflight.set(uri, promise);
  return promise;
}

export function getPreloadImagePromise(uri: string): Promise<void> | null {
  if (!uri || prefetchedUris.has(uri)) {
    return null;
  }

  return inflight.get(uri) ?? null;
}

export async function preloadImages(
  uris: string[],
  options?: {concurrency?: number},
): Promise<void> {
  const uniqueUris = [...new Set(uris.filter(Boolean))];
  if (uniqueUris.length === 0) {
    return;
  }

  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  for (let index = 0; index < uniqueUris.length; index += concurrency) {
    const batch = uniqueUris.slice(index, index + concurrency);
    await Promise.all(batch.map(uri => preloadImage(uri)));
  }
}
