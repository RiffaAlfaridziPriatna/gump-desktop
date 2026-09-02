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
      interJobDelayMs?: number;
      maxDecodePixelSize?: number;
      progressiveBatchSize?: number;
    },
  ) => Promise<{success: boolean}>;
  cancelAnalysis: () => Promise<{success: boolean}>;
  isRunning?: () => Promise<{running: boolean}>;
};

export type AnalysisSessionTuning = {
  maxConcurrency: number;
  interJobDelayMs: number;
  maxDecodePixelSize: number;
  progressiveBatchSize: number;
};

let lowPowerModeEnabled = false;

export function setAnalysisLowPowerMode(enabled: boolean): void {
  lowPowerModeEnabled = enabled;
}

export function getAnalysisSessionTuning(): AnalysisSessionTuning {
  if (lowPowerModeEnabled) {
    return {
      maxConcurrency: 1,
      interJobDelayMs: 200,
      maxDecodePixelSize: 2048,
      progressiveBatchSize: 20,
    };
  }

  return {
    maxConcurrency: Platform.OS === 'windows' ? 1 : 2,
    interJobDelayMs: 50,
    maxDecodePixelSize: 2048,
    progressiveBatchSize: 20,
  };
}

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

function readFiniteCount(value: unknown): number | null {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return null;
  }
  return count;
}

function coerceAnalysisProgress(event: unknown): AnalysisProgressEvent | null {
  if (!event || typeof event !== 'object') {
    return null;
  }
  const record = event as Record<string, unknown>;
  const nested = record.body;
  const source =
    nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>)
      : record;
  const total = readFiniteCount(source.total);
  if (total == null || total <= 0) {
    return null;
  }
  return {
    done: readFiniteCount(source.done) ?? 0,
    total,
    failed: readFiniteCount(source.failed) ?? 0,
  };
}

export type NativeAnalysisPhotoFlags = {
  aiSelected: boolean;
  maybe: boolean;
  blurred: boolean;
  closedEyes: boolean;
  selected: boolean;
};

export type NativeAnalysisPhotoResult = {
  photoId: string;
  success: boolean;
  error?: string;
  faces?: NativeDetectedFace[];
  perceptualHash?: string | null;
  capturedAt?: number | null;
  flags?: NativeAnalysisPhotoFlags;
  starRating?: number;
  duplicated?: boolean;
};

export type NativeDuplicateGroup = {
  groupId: string;
  photoIds: string[];
  bestPhotoId: string;
};

export type AnalysisCompleteEvent = {
  done: number;
  total: number;
  failed: number;
  postProcessed?: boolean;
  results: NativeAnalysisPhotoResult[];
  duplicateGroups?: NativeDuplicateGroup[];
};

export type AnalysisBatchEvent = {
  results: NativeAnalysisPhotoResult[];
};

type ProgressListener = (event: AnalysisProgressEvent) => void;
type CompleteListener = (event: AnalysisCompleteEvent) => void;
type BatchListener = (event: AnalysisBatchEvent) => void;

let progressSubscription: {remove: () => void} | null = null;
let completeSubscription: {remove: () => void} | null = null;
let batchSubscription: {remove: () => void} | null = null;

export async function startNativeAnalysis(
  albumId: string,
  photos: CulledAlbumPhoto[],
  config: Partial<AnalysisSessionTuning> = {},
): Promise<void> {
  const module = nativeAnalysisModule();
  if (!module) {
    throw new Error('Native analysis not supported on this platform');
  }

  const tuning = {...getAnalysisSessionTuning(), ...config};
  const photoInputs = photos.map(photo => ({
    photoId: photo.photoId,
    uri: photo.file.uri,
    fileName: photo.file.name,
    capturedAt: photo.capturedAt ?? 0,
    perceptualHash: photo.perceptualHash ?? '',
  }));

  await module.startAnalysis(albumId, photoInputs, tuning);
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
  onBatch?: BatchListener,
): () => void {
  const emitter = analysisEventSource();
  if (!emitter) {
    return () => {};
  }

  unsubscribeFromNativeAnalysis();

  progressSubscription = emitter.addListener(
    'analysisProgress',
    (event: unknown) => {
      const progress = coerceAnalysisProgress(event);
      if (!progress) {
        return;
      }
      onProgress(progress);
    },
  );

  completeSubscription = emitter.addListener(
    'analysisComplete',
    (event: AnalysisCompleteEvent) => {
      onComplete(event);
    },
  );

  if (onBatch) {
    batchSubscription = emitter.addListener(
      'analysisBatch',
      (event: AnalysisBatchEvent) => {
        onBatch(event);
      },
    );
  }

  return unsubscribeFromNativeAnalysis;
}

export function unsubscribeFromNativeAnalysis(): void {
  progressSubscription?.remove();
  progressSubscription = null;
  completeSubscription?.remove();
  completeSubscription = null;
  batchSubscription?.remove();
  batchSubscription = null;
}
