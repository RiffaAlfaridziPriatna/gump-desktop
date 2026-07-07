import {hasAnyInFlightAlbumWork} from '@lib/culledAlbum/store';
import {
  StackNavigationOptions,
  TransitionPresets,
} from '@react-navigation/stack';

export type InstantNavParams = {
  instant?: boolean;
};

export type WithInstantNav<T> = T & InstantNavParams;

const deferred: Array<() => void> = [];
let coopDepth = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

const COOP_SAFETY_MS = 1000;

function flushDeferred(): void {
  const pending = deferred.splice(0);
  if (pending.length === 0) {
    return;
  }

  queueMicrotask(() => {
    for (const work of pending) {
      work();
    }
  });
}

export function isUploadNavigationActive(): boolean {
  return coopDepth > 0;
}

function beginUploadNavigationCoop(): void {
  coopDepth++;

  if (safetyTimer) {
    clearTimeout(safetyTimer);
  }

  safetyTimer = setTimeout(() => {
    if (coopDepth > 0) {
      coopDepth = 0;
      flushDeferred();
    }
    safetyTimer = null;
  }, COOP_SAFETY_MS);
}

export function endUploadNavigationCoop(): void {
  if (coopDepth === 0) {
    return;
  }

  coopDepth--;
  if (coopDepth > 0) {
    return;
  }

  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }

  flushDeferred();
}

export function runDeferredDuringUploadNavigation(work: () => void): void {
  if (!isUploadNavigationActive()) {
    work();
    return;
  }
  deferred.push(work);
}

export function uploadAwareParams<T extends object>(params: T): T & InstantNavParams {
  if (!hasAnyInFlightAlbumWork()) {
    return params;
  }

  beginUploadNavigationCoop();
  return {...params, instant: true};
}

export function uploadAwareRouteParams(): InstantNavParams | undefined {
  if (!hasAnyInFlightAlbumWork()) {
    return undefined;
  }

  beginUploadNavigationCoop();
  return {instant: true};
}

const modalSlideOptions: StackNavigationOptions = {
  animation: 'slide_from_bottom',
  ...TransitionPresets.ModalSlideFromBottomIOS,
  cardOverlayEnabled: true,
  gestureEnabled: true,
};

export function uploadAwareModalScreenOptions({
  route,
}: {
  route: {params?: InstantNavParams};
}): StackNavigationOptions {
  if (route.params?.instant) {
    return {
      animation: 'none',
      gestureEnabled: true,
    };
  }

  return modalSlideOptions;
}

export const modalSlideFromBottomOptions = modalSlideOptions;
