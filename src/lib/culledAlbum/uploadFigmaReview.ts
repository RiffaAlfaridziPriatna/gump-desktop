import type {CloudStoragePreflight} from '@lib/culledAlbum/uploadPreflight';

/**
 * Figma Upload visual review (node 12975:30617).
 * Bump `UPLOAD_FIGMA_REVIEW_INDEX` when the user says "aman".
 * Set `UPLOAD_FIGMA_REVIEW_ENABLED` to false when done.
 */
export const UPLOAD_FIGMA_REVIEW_ENABLED = __DEV__ && false;

/** 0-based index into UPLOAD_FIGMA_REVIEW_STATES. */
export const UPLOAD_FIGMA_REVIEW_INDEX = 9;

const GB = 1024 ** 3;

export type UploadFigmaReviewStateId =
  | 'album-upload-picked'
  | 'checking-storage'
  | 'storage-unavailable'
  | 'confirm'
  | 'confirm-near-limit'
  | 'not-enough-storage'
  | 'confirm-after-upgrade'
  | 'uploading'
  | 'partial-failure'
  | 'complete';

type ReviewPhase = 'confirm' | 'uploading' | 'complete';

type ReviewFailures = {
  total: number;
  uploaded: number;
  retryable: number;
  quota: number;
  final: number;
  retryBytes: number;
};

export type UploadFigmaReviewSnapshot = {
  id: UploadFigmaReviewStateId;
  /** Figma frame name. */
  label: string;
  /** false = album chrome only (no modal). */
  showModal: boolean;
  phase: ReviewPhase;
  photoCount: number;
  uploadedCount: number;
  uploadSizeGb: number;
  uploadedBytes: number;
  totalUploadBytes: number;
  uploadProgress: number;
  isApplyingLook: boolean;
  bakeDiskFull?: {requiredBytes: number};
  preflight: CloudStoragePreflight;
  failures: ReviewFailures;
};

const emptyFailures = (total: number): ReviewFailures => ({
  total,
  uploaded: total,
  retryable: 0,
  quota: 0,
  final: 0,
  retryBytes: 0,
});

const okPreflight = (
  usedGb: number,
  limitGb: number,
  uploadGb: number,
): CloudStoragePreflight => ({
  status: 'ok',
  uploadBytes: uploadGb * GB,
  usedBytes: usedGb * GB,
  limitBytes: limitGb * GB,
  afterBytes: (usedGb + uploadGb) * GB,
});

const nearLimitPreflight = (
  usedGb: number,
  limitGb: number,
  uploadGb: number,
): CloudStoragePreflight => ({
  status: 'nearLimit',
  uploadBytes: uploadGb * GB,
  usedBytes: usedGb * GB,
  limitBytes: limitGb * GB,
  afterBytes: (usedGb + uploadGb) * GB,
});

const exceededPreflight = (
  usedGb: number,
  limitGb: number,
  uploadGb: number,
): CloudStoragePreflight => ({
  status: 'exceeded',
  uploadBytes: uploadGb * GB,
  usedBytes: usedGb * GB,
  limitBytes: limitGb * GB,
  afterBytes: (usedGb + uploadGb) * GB,
});

const PHOTO_COUNT = 48;
const UPLOAD_GB = 2.4;
const TOTAL_BYTES = UPLOAD_GB * GB;

function base(
  id: UploadFigmaReviewStateId,
  label: string,
  overrides: Partial<UploadFigmaReviewSnapshot> & {
    showModal: boolean;
    phase: ReviewPhase;
    preflight: CloudStoragePreflight;
  },
): UploadFigmaReviewSnapshot {
  return {
    id,
    label,
    photoCount: PHOTO_COUNT,
    uploadedCount: 0,
    uploadSizeGb: UPLOAD_GB,
    uploadedBytes: 0,
    totalUploadBytes: TOTAL_BYTES,
    uploadProgress: 0,
    isApplyingLook: false,
    failures: emptyFailures(PHOTO_COUNT),
    ...overrides,
  };
}

export const UPLOAD_FIGMA_REVIEW_STATES: readonly UploadFigmaReviewSnapshot[] = [
  base('album-upload-picked', 'Album - Upload Picked', {
    showModal: false,
    phase: 'confirm',
    preflight: {status: 'checking'},
  }),
  base('checking-storage', 'Upload - Checking storage', {
    showModal: true,
    phase: 'confirm',
    preflight: {status: 'checking'},
  }),
  base('storage-unavailable', 'Upload - Storage check unavailable', {
    showModal: true,
    phase: 'confirm',
    preflight: {status: 'unavailable'},
  }),
  base('confirm', 'Upload confirmation', {
    showModal: true,
    phase: 'confirm',
    preflight: okPreflight(12.1, 50, UPLOAD_GB),
  }),
  base('confirm-near-limit', 'Upload confirmation - Near storage limit', {
    showModal: true,
    phase: 'confirm',
    // 0.3 GB left after upload → used + upload = limit - 0.3
    preflight: nearLimitPreflight(47.3, 50, UPLOAD_GB),
  }),
  base('not-enough-storage', 'Not enough cloud storage', {
    showModal: true,
    phase: 'confirm',
    preflight: exceededPreflight(48.5, 50, UPLOAD_GB),
  }),
  base('confirm-after-upgrade', 'Upload confirmation - After cloud upgrade', {
    showModal: true,
    phase: 'confirm',
    // Same UI as confirm (4); Figma only changes plan size for story —
    // keep numbers identical so visual review matches state 4.
    preflight: okPreflight(12.1, 50, UPLOAD_GB),
  }),
  base('uploading', 'Uploading', {
    showModal: true,
    phase: 'uploading',
    uploadedCount: 18,
    uploadedBytes: 0.9 * GB,
    uploadProgress: 0.375,
    preflight: okPreflight(12.1, 50, UPLOAD_GB),
  }),
  base('partial-failure', 'Upload - Partial failure', {
    showModal: true,
    phase: 'complete',
    uploadedCount: 42,
    uploadProgress: 1,
    uploadedBytes: TOTAL_BYTES,
    preflight: okPreflight(14.5, 50, UPLOAD_GB),
    // Figma frame is retryable-only (one subtitle line), not mixed with final.
    failures: {
      total: PHOTO_COUNT,
      uploaded: 42,
      retryable: 6,
      quota: 0,
      final: 0,
      retryBytes: 0.3 * GB,
    },
  }),
  base('complete', 'Upload complete', {
    showModal: true,
    phase: 'complete',
    uploadedCount: PHOTO_COUNT,
    uploadProgress: 1,
    uploadedBytes: TOTAL_BYTES,
    preflight: okPreflight(14.5, 50, UPLOAD_GB),
    failures: emptyFailures(PHOTO_COUNT),
  }),
];

let lastLoggedReviewIndex: number | null = null;

export function getUploadFigmaReview(): UploadFigmaReviewSnapshot | null {
  if (!UPLOAD_FIGMA_REVIEW_ENABLED) {
    return null;
  }
  const states = UPLOAD_FIGMA_REVIEW_STATES;
  const index = Math.min(
    Math.max(0, UPLOAD_FIGMA_REVIEW_INDEX),
    states.length - 1,
  );
  const snapshot = states[index] ?? null;
  if (snapshot != null && __DEV__ && lastLoggedReviewIndex !== index) {
    lastLoggedReviewIndex = index;
    console.info(
      `[Upload Figma review] ${index + 1}/${states.length}: ${snapshot.label}`,
    );
  }
  return snapshot;
}
