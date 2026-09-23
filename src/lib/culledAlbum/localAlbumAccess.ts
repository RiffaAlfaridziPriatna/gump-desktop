/** Session overrides so newly registered albums show before the next getByIds. */
let sessionAccessibleAlbumIds = new Set<string>();

export function markLocalAlbumAccessible(albumId: string): void {
  sessionAccessibleAlbumIds.add(albumId);
}

export function isLocalAlbumMarkedAccessible(albumId: string): boolean {
  return sessionAccessibleAlbumIds.has(albumId);
}

export function resetLocalAlbumAccessSession(): void {
  sessionAccessibleAlbumIds = new Set();
}

export function getSessionAccessibleLocalAlbumIds(): ReadonlySet<string> {
  return sessionAccessibleAlbumIds;
}

export function replaceSessionAccessibleLocalAlbumIds(
  albumIds: Iterable<string>,
): void {
  sessionAccessibleAlbumIds = new Set(albumIds);
}
