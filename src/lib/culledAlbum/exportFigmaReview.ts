import type {PreparedExport} from '@lib/export/prepareExport';
import type {
  ExportFailureReason,
  ExportPhotosModalStep,
  ExportQuality,
  ExportZipResult,
} from '@lib/export/types';

/**
 * Figma Export visual review (node 12975:35615).
 * Bump `EXPORT_FIGMA_REVIEW_INDEX` when the user says "aman".
 * Set `EXPORT_FIGMA_REVIEW_ENABLED` to false when done.
 */
export const EXPORT_FIGMA_REVIEW_ENABLED = __DEV__ && false;

/** 0-based index into EXPORT_FIGMA_REVIEW_STATES. */
export const EXPORT_FIGMA_REVIEW_INDEX = 9;

const GB = 1024 ** 3;
const PHOTO_COUNT = 48;

export type ExportFigmaReviewStateId =
  | 'album-export'
  | 'options'
  | 'options-trial-ended'
  | 'preparing'
  | 'missing-source'
  | 'ready-save'
  | 'save-cancelled'
  | 'disk-full'
  | 'folder-not-writable'
  | 'complete';

export type ExportFigmaReviewSnapshot = {
  id: ExportFigmaReviewStateId;
  label: string;
  showModal: boolean;
  step: ExportPhotosModalStep;
  photoCount: number;
  quality: ExportQuality;
  trialEnded: boolean;
  progressPercent: number;
  saveCancelled: boolean;
  preparedExport: PreparedExport | null;
  downloadedExport: ExportZipResult | null;
  failureKind: 'prepare' | 'download' | null;
  exportError: {
    reason: ExportFailureReason;
    requiredBytes?: number;
    missingCount?: number;
  } | null;
};

const prepared: PreparedExport = {
  path: '/tmp/gump-export/Wedding_Album.zip',
  uri: 'file:///tmp/gump-export/Wedding_Album.zip',
  fileName: 'Wedding_Album.zip',
  byteSize: 1.2 * GB,
  displayPath: '~/Downloads',
  photoCount: PHOTO_COUNT,
  stagingPath: '/tmp/gump-export-staging',
};

const downloaded: ExportZipResult = {
  path: '/Users/demo/Downloads/Wedding_Album.zip',
  uri: 'file:///Users/demo/Downloads/Wedding_Album.zip',
  fileName: 'Wedding_Album.zip',
  byteSize: 1.2 * GB,
  displayPath: '~/Downloads',
  photoCount: PHOTO_COUNT,
};

function base(
  id: ExportFigmaReviewStateId,
  label: string,
  overrides: Partial<ExportFigmaReviewSnapshot> & {
    showModal: boolean;
    step: ExportPhotosModalStep;
  },
): ExportFigmaReviewSnapshot {
  return {
    id,
    label,
    photoCount: PHOTO_COUNT,
    quality: 'compressed',
    trialEnded: false,
    progressPercent: 0,
    saveCancelled: false,
    preparedExport: null,
    downloadedExport: null,
    failureKind: null,
    exportError: null,
    ...overrides,
  };
}

export const EXPORT_FIGMA_REVIEW_STATES: readonly ExportFigmaReviewSnapshot[] = [
  base('album-export', 'Album - Export', {
    showModal: false,
    step: 'options',
  }),
  base('options', 'Export options', {
    showModal: true,
    step: 'options',
  }),
  base('options-trial-ended', 'Export options - Trial ended', {
    showModal: true,
    step: 'options',
    quality: 'original',
    trialEnded: true,
  }),
  base('preparing', 'Preparing export', {
    showModal: true,
    step: 'preparing',
    progressPercent: 45,
  }),
  base('missing-source', 'Export - Missing source files', {
    showModal: true,
    step: 'failed',
    failureKind: 'prepare',
    exportError: {reason: 'sourceMissing', missingCount: 3},
  }),
  base('ready-save', 'Export ready - Save', {
    showModal: true,
    step: 'ready',
    preparedExport: prepared,
  }),
  base('save-cancelled', 'Export - Save cancelled', {
    showModal: true,
    step: 'ready',
    saveCancelled: true,
    preparedExport: prepared,
  }),
  base('disk-full', 'Export - Not enough disk space', {
    showModal: true,
    step: 'failed',
    failureKind: 'download',
    preparedExport: prepared,
    exportError: {reason: 'diskFull', requiredBytes: 2.4 * GB},
  }),
  base('folder-not-writable', "Export - Can't save to this folder", {
    showModal: true,
    step: 'failed',
    failureKind: 'download',
    preparedExport: prepared,
    exportError: {reason: 'folderNotWritable'},
  }),
  base('complete', 'Export complete', {
    showModal: true,
    step: 'success',
    preparedExport: prepared,
    downloadedExport: downloaded,
  }),
];

let lastLoggedReviewIndex: number | null = null;

export function getExportFigmaReview(): ExportFigmaReviewSnapshot | null {
  if (!EXPORT_FIGMA_REVIEW_ENABLED) {
    return null;
  }
  const states = EXPORT_FIGMA_REVIEW_STATES;
  const index = Math.min(
    Math.max(0, EXPORT_FIGMA_REVIEW_INDEX),
    states.length - 1,
  );
  const snapshot = states[index] ?? null;
  if (snapshot != null && __DEV__ && lastLoggedReviewIndex !== index) {
    lastLoggedReviewIndex = index;
    console.info(
      `[Export Figma review] ${index + 1}/${states.length}: ${snapshot.label}`,
    );
  }
  return snapshot;
}
