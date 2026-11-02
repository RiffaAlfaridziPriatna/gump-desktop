export type UploadFailureGroup = 'retryable' | 'quota' | 'final';

export type UploadFailureCause =
  | 'network'
  | 'timeout'
  | 'server'
  | 'rateLimited'
  | 'storageLimit'
  | 'dataUsageLimit'
  | 'rejected'
  | 'sourceMissing'
  | 'unknown';

export const UPLOAD_FAILURE_GROUP: Readonly<
  Record<UploadFailureCause, UploadFailureGroup>
> = {
  network: 'retryable',
  timeout: 'retryable',
  server: 'retryable',
  rateLimited: 'retryable',
  unknown: 'retryable',
  storageLimit: 'quota',
  dataUsageLimit: 'quota',
  rejected: 'final',
  sourceMissing: 'final',
};

export const NEAR_LIMIT_RATIO = 0.05;

type CloudStorageNumbers = {
  uploadBytes: number;
  usedBytes: number;
  /** null = unlimited plan */
  limitBytes: number | null;
  afterBytes: number;
};

export type CloudStoragePreflight =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | ({ status: 'ok' | 'nearLimit' | 'exceeded' } & CloudStorageNumbers);
