import {
  APIException,
  flattenValidationErrors,
} from '@services/api/exception';
import {MultipartUploadError} from '@services/upload/multipart';
import type {UploadFailureCause} from './uploadPreflight';

export class UploadTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'UploadTimeoutError';
  }
}

export class UploadSourceMissingError extends Error {
  constructor(message: string, options?: {cause?: unknown}) {
    super(message);
    this.cause = options?.cause;
    this.name = 'UploadSourceMissingError';
  }
}

const FETCH_FAILURE = /network request failed|failed to fetch/i;

function causeFromStatus(status: number): UploadFailureCause {
  if (status >= 500) return 'server';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rateLimited';
  if (status >= 400) return 'rejected';
  return 'unknown';
}

/** Single place where server upload errors become a failure cause. */
export function classifyUploadError(err: unknown): UploadFailureCause {
  if (err instanceof APIException) {
    if (err.name === 'USER_STORAGE_GB_LIMIT') return 'storageLimit';
    if (err.name === 'USER_DATA_USAGE_LIMIT') return 'dataUsageLimit';
    return causeFromStatus(err.statusCode);
  }
  if (err instanceof MultipartUploadError) {
    if (err.lastStatus) return causeFromStatus(err.lastStatus);
    return err.category === 'timeout' ? 'timeout' : 'network';
  }
  if (err instanceof UploadTimeoutError) return 'timeout';
  if (err instanceof UploadSourceMissingError) return 'sourceMissing';
  if (err instanceof TypeError && FETCH_FAILURE.test(err.message)) {
    return 'network';
  }
  return 'unknown';
}

export function formatUploadError(err: unknown): string | undefined {
  if (err instanceof APIException) {
    const validationMessages = err.details
      ? flattenValidationErrors(err.details)
      : [];
    if (validationMessages.length > 0) {
      return validationMessages.join(', ');
    }
    if (err.message) {
      return err.message;
    }
    return err.name;
  }

  if (err instanceof MultipartUploadError) {
    if (err.lastStatus) {
      return `Upload failed (HTTP ${err.lastStatus})`;
    }
    return 'Upload failed';
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return undefined;
}
