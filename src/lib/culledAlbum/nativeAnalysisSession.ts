import {DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import type {NativeDetectedFace} from './types';
import type {CulledAlbumPhoto} from './types';

type NativeAnalysisSessionModule = {
  startAnalysis: (
    albumId: string,
    photos: Array<{
      photoId: string;
      uri: string;
      fileName: string;
      capturedAt: number | null;
      perceptualHash: string | null;
    }>,
    config: {
      maxConcurrency: number;
    },
  ) => Promise<{success: boolean}>;
  cancelAnalysis: () => Promise<{success: boolean}>;
  pauseAnalysis?: () => Promise<{success: boolean}>;
  resumeAnalysis?: () => Promise<{success: boolean}>;
  isRunning?: () => Promise<{running: boolean}>;
};

function nativeAnalysisModule(): NativeAnalysisSessionModule | null {
  if (Platform.OS === 'macos') {
    return NativeModules.GumpAnalysisSession ?? null;
  }
  if (Platform.OS === 'windows') {
    const storage = NativeModules.GumpLocalStorage as
      | (NativeAnalysisSessionModule & object)
      | undefined;
    if (storage && typeof storage.startAnalysis === 'function') {
      return storage;
    }
  }
  return null;
}

export function isNativeAnalysisSupported(): boolean {
  return nativeAnalysisModule() != null;
}

const macosEmitter = NativeModules.GumpAnalysisSession
  ? new NativeEventEmitter(NativeModules.GumpAnalysisSession)
  : null;

function analysisEventSource() {
  if (Platform.OS === 'macos') {
    return macosEmitter;
  }
  if (Platform.OS === 'windows') {
    return DeviceEventEmitter;
  }
  return null;
}

export type AnalysisProgressEvent = {
  done: number;
  total: number;
  failed: number;
};

export type NativeAnalysisPhotoResult = {
  photoId: string;
  success: boolean;
  error?: string;
  faces?: NativeDetectedFace[];
  perceptualHash?: string | null;
  capturedAt?: number | null;
};

export type AnalysisCompleteEvent = {
  done: number;
  total: number;
  failed: number;
  results: NativeAnalysisPhotoResult[];
};

type ProgressListener = (event: AnalysisProgressEvent) => void;
type CompleteListener = (event: AnalysisCompleteEvent) => void;

let progressSubscription: {remove: () => void} | null = null;
let completeSubscription: {remove: () => void} | null = null;

export async function startNativeAnalysis(
  albumId: string,
  photos: CulledAlbumPhoto[],
  config: {maxConcurrency?: number} = {},
): Promise<void> {
  const module = nativeAnalysisModule();
  if (!module) {
    throw new Error('Native analysis not supported on this platform');
  }

  const photoInputs = photos.map(photo => ({
    photoId: photo.photoId,
    uri: photo.file.uri,
    fileName: photo.file.name,
    capturedAt: photo.capturedAt ?? 0,
    perceptualHash: photo.perceptualHash ?? '',
  }));

  await module.startAnalysis(albumId, photoInputs, {
    maxConcurrency: config.maxConcurrency ?? (Platform.OS === 'windows' ? 2 : 3),
  });
}

export async function cancelNativeAnalysis(): Promise<void> {
  const module = nativeAnalysisModule();
  if (!module) {
    return;
  }
  await module.cancelAnalysis();
}

export function subscribeToNativeAnalysis(
  onProgress: ProgressListener,
  onComplete: CompleteListener,
): () => void {
  const emitter = analysisEventSource();
  if (!emitter) {
    return () => {};
  }

  unsubscribeFromNativeAnalysis();

  progressSubscription = emitter.addListener(
    'analysisProgress',
    (event: AnalysisProgressEvent) => {
      onProgress(event);
    },
  );

  completeSubscription = emitter.addListener(
    'analysisComplete',
    (event: AnalysisCompleteEvent) => {
      onComplete(event);
    },
  );

  return unsubscribeFromNativeAnalysis;
}

export function unsubscribeFromNativeAnalysis(): void {
  progressSubscription?.remove();
  progressSubscription = null;
  completeSubscription?.remove();
  completeSubscription = null;
}
