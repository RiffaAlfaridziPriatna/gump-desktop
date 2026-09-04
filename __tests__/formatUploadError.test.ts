import {APIException, flattenValidationErrors} from '../src/services/api/exception';
import {MultipartUploadError} from '../src/services/upload/multipart';
import {formatUploadError} from '../src/lib/culledAlbum/formatUploadError';

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
