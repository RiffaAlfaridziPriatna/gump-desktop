import {APIException, flattenValidationErrors} from '../src/services/api/exception';
import {MultipartUploadError} from '../src/services/upload/multipart';
import {
  classifyUploadError,
  formatUploadError,
  UploadSourceMissingError,
  UploadTimeoutError,
} from '../src/lib/culledAlbum/formatUploadError';
import {UPLOAD_FAILURE_GROUP} from '../src/lib/culledAlbum/uploadPreflight';

describe('flattenValidationErrors', () => {
  it('walks nested _errors without looping on cycles', () => {
    const nested: Record<string, unknown> = {
      _errors: ['root'],
      file: {_errors: ['too large'], name: {_errors: ['required']}},
    };
    (nested as {self?: unknown}).self = nested;
    expect(flattenValidationErrors(nested)).toEqual([
      'root',
      'too large',
      'required',
    ]);
    expect(flattenValidationErrors(null)).toEqual([]);
  });
});

describe('formatUploadError', () => {
  it('prefers API validation messages, then the exception message', () => {
    const withDetails = new APIException(400, 'ValidationError', 'Invalid', {
      _errors: ['name required'],
    } as never);
    expect(formatUploadError(withDetails)).toBe('name required');

    const withoutDetails = new APIException(500, 'ServerError', 'Boom', undefined);
    expect(formatUploadError(withoutDetails)).toBe('Boom');
  });

  it('formats multipart failures with HTTP status when present', () => {
    expect(
      formatUploadError(
        new MultipartUploadError({attempts: 2, category: 'http', lastStatus: 503}),
      ),
    ).toBe('Upload failed (HTTP 503)');
    expect(
      formatUploadError(
        new MultipartUploadError({attempts: 1, category: 'network'}),
      ),
    ).toBe('Upload failed');
  });

  it('falls back to Error.message and ignores unknowns', () => {
    expect(formatUploadError(new Error('disk'))).toBe('disk');
    expect(formatUploadError('nope')).toBeUndefined();
  });
});

describe('classifyUploadError', () => {
  const api = (status: number, name = 'Error') =>
    new APIException(status, name, 'msg', undefined);
  const multipart = (
    category: 'network' | 'http' | 'timeout',
    lastStatus?: number,
  ) => new MultipartUploadError({attempts: 4, category, lastStatus});

  it.each([
    ['quota storage code', api(403, 'USER_STORAGE_GB_LIMIT'), 'storageLimit', 'quota'],
    ['quota data code', api(403, 'USER_DATA_USAGE_LIMIT'), 'dataUsageLimit', 'quota'],
    ['quota code wins over 5xx', api(500, 'USER_STORAGE_GB_LIMIT'), 'storageLimit', 'quota'],
    ['api 500', api(500), 'server', 'retryable'],
    ['api 503', api(503), 'server', 'retryable'],
    ['api 408', api(408), 'timeout', 'retryable'],
    ['api 429', api(429), 'rateLimited', 'retryable'],
    ['api 400', api(400), 'rejected', 'final'],
    ['api 404', api(404), 'rejected', 'final'],
    ['api 413', api(413), 'rejected', 'final'],
    ['api status below 400', api(302), 'unknown', 'retryable'],
    ['multipart 503', multipart('http', 503), 'server', 'retryable'],
    ['multipart 403', multipart('http', 403), 'rejected', 'final'],
    ['multipart 429', multipart('http', 429), 'rateLimited', 'retryable'],
    ['multipart network', multipart('network'), 'network', 'retryable'],
    ['multipart timeout', multipart('timeout'), 'timeout', 'retryable'],
    ['fetch TypeError (RN)', new TypeError('Network request failed'), 'network', 'retryable'],
    ['fetch TypeError (web)', new TypeError('Failed to fetch'), 'network', 'retryable'],
    ['unrelated TypeError', new TypeError("Cannot read properties of undefined"), 'unknown', 'retryable'],
    ['queue timeout', new UploadTimeoutError('Server photo upload', 600000), 'timeout', 'retryable'],
    ['missing photo', new UploadSourceMissingError('Photo not found'), 'sourceMissing', 'final'],
    ['plain Error', new Error('boom'), 'unknown', 'retryable'],
    ['non-error', 'nope', 'unknown', 'retryable'],
  ])('%s', (_label, err, cause, group) => {
    expect(classifyUploadError(err)).toBe(cause);
    expect(UPLOAD_FAILURE_GROUP[classifyUploadError(err)]).toBe(group);
  });

  it('keeps the queue timeout message unchanged', () => {
    expect(new UploadTimeoutError('Server photo upload', 600000).message).toBe(
      'Server photo upload timed out after 600s',
    );
  });
});
