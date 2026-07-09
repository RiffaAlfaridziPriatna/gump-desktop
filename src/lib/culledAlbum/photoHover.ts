import {createContext, useContext, useSyncExternalStore} from 'react';

type Listener = () => void;

export class CulledAlbumPhotoHoverStore {
  private hoveredPhotoId: string | null = null;
  private photoListeners = new Map<string, Set<Listener>>();
  private isScrolling = false;

  subscribePhoto = (photoId: string, listener: Listener): (() => void) => {
    let listeners = this.photoListeners.get(photoId);
    if (!listeners) {
      listeners = new Set();
      this.photoListeners.set(photoId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
    };
  };

  isPhotoHovered = (photoId: string): boolean =>
    this.hoveredPhotoId === photoId;

  hoverIn = (photoId: string): void => {
    if (this.isScrolling || this.hoveredPhotoId === photoId) {
      return;
    }
    const previousPhotoId = this.hoveredPhotoId;
    this.hoveredPhotoId = photoId;
    this.notifyPhoto(previousPhotoId);
    this.notifyPhoto(photoId);
  };

  hoverOut = (photoId: string): void => {
    if (this.isScrolling || this.hoveredPhotoId !== photoId) {
      return;
    }
    this.hoveredPhotoId = null;
    this.notifyPhoto(photoId);
  };

  setScrolling = (scrolling: boolean): void => {
    if (this.isScrolling === scrolling) {
      return;
    }
    this.isScrolling = scrolling;
    if (scrolling) {
      const previousPhotoId = this.hoveredPhotoId;
      this.hoveredPhotoId = null;
      this.notifyPhoto(previousPhotoId);
    }
  };

  private notifyPhoto = (photoId: string | null): void => {
    if (!photoId) {
      return;
    }
    this.photoListeners.get(photoId)?.forEach(listener => listener());
  };
}

export function createCulledAlbumPhotoHoverStore(): CulledAlbumPhotoHoverStore {
  return new CulledAlbumPhotoHoverStore();
}

export const CulledAlbumPhotoHoverContext =
  createContext<CulledAlbumPhotoHoverStore | null>(null);

export function useCulledAlbumPhotoHoverStore(): CulledAlbumPhotoHoverStore {
  const store = useContext(CulledAlbumPhotoHoverContext);
  if (!store) {
    throw new Error(
      'useCulledAlbumPhotoHoverStore must be used within CulledAlbumPhotoHoverContext',
    );
  }
  return store;
}

export function useCulledAlbumPhotoHovered(photoId: string): boolean {
  const store = useCulledAlbumPhotoHoverStore();
  return useSyncExternalStore(
    callback => store.subscribePhoto(photoId, callback),
    () => store.isPhotoHovered(photoId),
    () => store.isPhotoHovered(photoId),
  );
}

