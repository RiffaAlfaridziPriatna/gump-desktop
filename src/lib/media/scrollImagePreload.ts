import {FileAsset} from '@services/upload/types';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {loadImageDimensions} from './imageDimensions';

const SCROLL_PRELOAD_DEBOUNCE_MS = 250;
const SCROLL_PRELOAD_CONCURRENCY = 2;
const VISIBLE_PADDING_CELLS = 3;

let generation = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUris: string[] = [];

function collectGridUris(files: FileAsset[]): string[] {
  const uris: string[] = [];
  for (const file of files) {
    const uri = resolveGridDisplayUri(file);
    if (uri) {
      uris.push(uri);
    }
  }
  return uris;
}

async function preloadDimensionsOnly(
  uris: string[],
  activeGeneration: number,
): Promise<void> {
  const uniqueUris = [...new Set(uris.filter(Boolean))];
  if (uniqueUris.length === 0) {
    return;
  }

  for (
    let index = 0;
    index < uniqueUris.length;
    index += SCROLL_PRELOAD_CONCURRENCY
  ) {
    if (activeGeneration !== generation) {
      return;
    }

    const batch = uniqueUris.slice(index, index + SCROLL_PRELOAD_CONCURRENCY);
    await Promise.all(batch.map(uri => loadImageDimensions(uri)));
  }
}

export function cancelScrollImagePreload(): void {
  generation += 1;
  pendingUris = [];
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export function scheduleScrollImagePreload(
  files: FileAsset[],
  options?: {debounceMs?: number},
): void {
  generation += 1;
  const activeGeneration = generation;
  pendingUris = collectGridUris(files);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const debounceMs = options?.debounceMs ?? SCROLL_PRELOAD_DEBOUNCE_MS;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (activeGeneration !== generation) {
      return;
    }
    void preloadDimensionsOnly(pendingUris, activeGeneration);
  }, debounceMs);
}

export function getScrollPreloadRange(
  minIndex: number,
  maxIndex: number,
  totalCount: number,
  columns: number,
): {start: number; end: number} {
  const padding = VISIBLE_PADDING_CELLS * columns;
  return {
    start: Math.max(0, minIndex - padding),
    end: Math.min(totalCount, maxIndex + padding + 1),
  };
}

export const SCROLL_GRID_VISIBLE_PADDING = VISIBLE_PADDING_CELLS;
