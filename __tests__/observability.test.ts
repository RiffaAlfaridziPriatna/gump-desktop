import {APIException} from '../src/services/api/exception';
import {MultipartUploadError} from '../src/services/upload/multipart';
import {AppError} from '../src/lib/observability/AppError';
import {
  describeFileUri,
  serializeError,
} from '../src/lib/observability/serializeError';
import {
  reportError,
  setErrorCaptureClient,
  installGlobalErrorReporting,
  uninstallGlobalErrorReporting,
} from '../src/lib/observability/reportError';
import {coerceAnalysisProgress} from '../src/lib/culledAlbum/nativeAnalysisSession';

describe('describeFileUri', () => {
  it('extracts scheme and extension without the full path', () => {
    expect(describeFileUri('file:///Users/me/Pictures/IMG_001.HEIC')).toEqual({
      uriScheme: 'file',
      fileExtension: 'heic',
    });
  });
});

describe('serializeError', () => {
  it('includes API status, code, and validation details', () => {
    const error = new APIException(400, 'ValidationError', 'Invalid payload', {
      _errors: ['name required'],
    } as never);

    expect(serializeError(error)).toEqual(
      expect.objectContaining({
        error_name: 'ValidationError',
        error_class: 'APIException',
        error_message: 'Invalid payload',
        api_status_code: 400,
        api_error_code: 'ValidationError',
        api_validation_errors: ['name required'],
      }),
    );
  });

  it('includes multipart retry metadata', () => {
    const error = new MultipartUploadError({
      attempts: 3,
      category: 'http',
      lastStatus: 503,
      requestId: 'req-1',
      hostId: 'host-1',
    });

    expect(serializeError(error)).toEqual(
      expect.objectContaining({
        error_name: 'MultipartUploadError',
        upload_attempts: 3,
        upload_category: 'http',
        upload_http_status: 503,
        upload_request_id: 'req-1',
        upload_host_id: 'host-1',
      }),
    );
  });

  it('walks cause chains and AppError context', () => {
    const cause = new Error('ENOENT: no such file');
    (cause as Error & {code?: string}).code = 'ENOENT';
    const error = new AppError('Local photo copy failed: ENOENT: no such file', {
      cause,
      context: {
        operation: 'local_photo_copy',
        albumId: 'album-1',
        photoId: 'photo-1',
        fileName: 'IMG_001.HEIC',
      },
    });

    expect(serializeError(error)).toEqual(
      expect.objectContaining({
        error_name: 'AppError',
        operation: 'local_photo_copy',
        albumId: 'album-1',
        photoId: 'photo-1',
        fileName: 'IMG_001.HEIC',
        cause_error_message: 'ENOENT: no such file',
        cause_native_code: 'ENOENT',
      }),
    );
  });

  it('redacts secrets in extra context', () => {
    expect(
      serializeError(new Error('boom'), {
        authorization: 'Bearer secret',
        password: 'hunter2',
        albumId: 'album-1',
      }),
    ).toEqual(
      expect.objectContaining({
        authorization: '[redacted]',
        password: '[redacted]',
        albumId: 'album-1',
      }),
    );
  });
});

describe('reportError', () => {
  const captureException = jest.fn();

  beforeEach(() => {
    captureException.mockReset();
    setErrorCaptureClient({captureException});
  });

  afterEach(() => {
    setErrorCaptureClient(null);
    uninstallGlobalErrorReporting();
  });

  it('sends a detailed exception once', () => {
    const error = new Error('disk full');
    reportError(error, {operation: 'local_photo_copy', albumId: 'a1'});
    reportError(error, {operation: 'local_photo_copy', albumId: 'a1'});

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        error_message: 'disk full',
        operation: 'local_photo_copy',
        albumId: 'a1',
        platform: expect.any(String),
      }),
    );
  });

  it('ignores user-cancelled upload and analysis', () => {
    reportError(new Error('Upload cancelled'), {operation: 'local_photo_copy'});
    reportError(new Error('Analysis cancelled'));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures tagged console.error messages', () => {
    installGlobalErrorReporting();
    console.error('[uploadQueue] Failed to persist album', 'album-1');
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'console.error',
        error_message: '[uploadQueue] Failed to persist album album-1',
      }),
    );
  });

  it('keeps in-flight analysis photos on stall reports', () => {
    reportError(new Error('Native analysis stalled with no progress'), {
      operation: 'native_analysis_stalled',
      inFlight: [
        {photoId: 'p1', fileName: 'IMG_001.HEIC', elapsedMs: 125000},
      ],
      remainingSample: [
        {photoId: 'p1', fileName: 'IMG_001.HEIC', analysisStatus: 'pending'},
      ],
      lastCompletedFileName: 'IMG_000.HEIC',
    });

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        operation: 'native_analysis_stalled',
        lastCompletedFileName: 'IMG_000.HEIC',
        inFlight: [
          {photoId: 'p1', fileName: 'IMG_001.HEIC', elapsedMs: 125000},
        ],
        remainingSample: [
          {photoId: 'p1', fileName: 'IMG_001.HEIC', analysisStatus: 'pending'},
        ],
      }),
    );
  });
});

describe('coerceAnalysisProgress', () => {
  it('reads in-flight photos and last completed file from native progress', () => {
    expect(
      coerceAnalysisProgress({
        done: 12,
        total: 80,
        failed: 1,
        queueRemaining: 65,
        abandonedCount: 2,
        lastCompletedPhotoId: 'p0',
        lastCompletedFileName: 'IMG_000.HEIC',
        inFlight: [
          {photoId: 'p1', fileName: 'IMG_001.HEIC', elapsedMs: 84210},
          {photoId: 'p2', fileName: 'IMG_002.JPG', elapsedMs: 2100},
        ],
      }),
    ).toEqual({
      done: 12,
      total: 80,
      failed: 1,
      queueRemaining: 65,
      abandonedCount: 2,
      lastCompletedPhotoId: 'p0',
      lastCompletedFileName: 'IMG_000.HEIC',
      inFlight: [
        {photoId: 'p1', fileName: 'IMG_001.HEIC', elapsedMs: 84210},
        {photoId: 'p2', fileName: 'IMG_002.JPG', elapsedMs: 2100},
      ],
    });
  });
});
