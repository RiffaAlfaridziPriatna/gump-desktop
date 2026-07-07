const loadedUris = new Set<string>();

export function isMasonryImageLoaded(uri: string): boolean {
  return Boolean(uri) && loadedUris.has(uri);
}

export function markMasonryImageLoaded(uri: string): void {
  if (uri) {
    loadedUris.add(uri);
  }
}

export function clearMasonryImageLoadCache(): void {
  loadedUris.clear();
}
