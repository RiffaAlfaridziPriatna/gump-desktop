import {
  APIException,
  flattenValidationErrors,
} from '@services/api/exception';
import {MultipartUploadError} from '@services/upload/multipart';

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
