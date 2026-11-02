import {AppError, type ErrorContext} from '@lib/observability/AppError';

export type ExportQuality = 'compressed' | 'original';

export type ExportFormat = 'zip';

export type ExportDirectoryInfo = {
  path: string;
  displayPath: string;
};

export type ExportZipEntry = {
  uri: string;
  name: string;
};

export type ExportZipResult = {
  path: string;
  uri: string;
  fileName: string;
  byteSize: number;
  displayPath: string;
  photoCount: number;
};

export type ExportPhotosModalStep =
  | 'options'
  | 'applyingLook'
  | 'preparing'
  | 'ready'
  | 'success'
  | 'failed';

export type ExportFailureReason =
  | 'diskFull'
  | 'folderNotWritable'
  | 'sourceMissing'
  | 'unknown';

/** Native reject codes (macOS and Windows) mapped to app reasons. */
export const EXPORT_NATIVE_CODE_REASONS = {
  E_DISK_FULL: 'diskFull',
  E_NOT_WRITABLE: 'folderNotWritable',
  E_SOURCE_MISSING: 'sourceMissing',
} as const satisfies Record<
  'E_DISK_FULL' | 'E_NOT_WRITABLE' | 'E_SOURCE_MISSING',
  ExportFailureReason
>;

export class ExportError extends AppError {
  readonly reason: ExportFailureReason;
  readonly requiredBytes?: number;
  readonly missingCount?: number;

  constructor(
    reason: ExportFailureReason,
    message: string,
    options: {
      cause?: unknown;
      context?: ErrorContext;
      requiredBytes?: number;
      missingCount?: number;
    } = {},
  ) {
    super(message, {
      cause: options.cause,
      context: options.context,
      name: 'ExportError',
    });
    this.reason = reason;
    this.requiredBytes = options.requiredBytes;
    this.missingCount = options.missingCount;
  }
}
