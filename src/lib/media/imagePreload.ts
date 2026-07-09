import {Image} from 'react-native';
import {FileAsset} from '@services/upload/types';
import {resolveDisplayUri} from '@lib/storage/localStorage';
import {loadImageDimensions} from './imageDimensions';

const DEFAULT_CONCURRENCY = 4;

const prefetchedUris = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export function isImagePrefetched(uri: string): boolean {
  return Boolean(uri) && prefetchedUris.has(uri);
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

export function preloadFileAssets(
  files: FileAsset[],
  options?: {concurrency?: number},
): Promise<void> {
  return preloadImages(files.map(resolveDisplayUri), options);
}

