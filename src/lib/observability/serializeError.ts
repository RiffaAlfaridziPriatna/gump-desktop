import {APIException, flattenValidationErrors} from '@services/api/exception';
import {MultipartUploadError} from '@services/upload/multipart';
import {AppError, getErrorMessage} from './AppError';

const REDACT_KEY =
  /token|password|authorization|secret|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token/i;
const MAX_STRING = 4000;
const MAX_CAUSE_DEPTH = 5;

export type SerializedError = Record<string, unknown>;

export function describeFileUri(uri: string | undefined): {
  uriScheme?: string;
  fileExtension?: string;
} {
  if (!uri) {
    return {};
  }

  const scheme = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1];
  const pathPart = (uri.split('?')[0] ?? uri).replace(/\\/g, '/');
  const lastSegment = pathPart.split('/').pop() ?? pathPart;
  const ext = lastSegment.includes('.')
    ? lastSegment.split('.').pop()?.toLowerCase()
    : undefined;

  return {
    ...(scheme ? {uriScheme: scheme} : {}),
    ...(ext ? {fileExtension: ext} : {}),
  };
}

export function serializeError(
  error: unknown,
  extra?: Record<string, unknown>,
): SerializedError {
  const properties: SerializedError = {
    ...serializeUnknown(error, 0),
    ...sanitizeContext(extra),
  };

  return properties;
}

function serializeUnknown(
  error: unknown,
  depth: number,
  prefix = '',
): SerializedError {
  const key = (name: string) => (prefix ? `${prefix}_${name}` : name);

  if (error === undefined || error === null) {
    return {[key('error')]: error === null ? 'null' : 'undefined'};
  }

  if (typeof error === 'string') {
    return {[key('error_message')]: truncate(error)};
  }

  const properties: SerializedError = {
    [key('error_name')]:
      error instanceof Error
        ? error.name
        : typeof error === 'object' &&
            error &&
            'name' in error &&
            typeof (error as {name: unknown}).name === 'string'
          ? (error as {name: string}).name
          : typeof error,
    [key('error_message')]: truncate(getErrorMessage(error) || String(error)),
  };

  if (error instanceof Error) {
    properties[key('error_class')] = error.constructor.name;
  }

  if (error instanceof Error && error.stack) {
    properties[key('error_stack')] = truncate(error.stack);
  }

  if (error instanceof AppError) {
    Object.assign(properties, sanitizeContext(error.context, prefix));
  }

  if (error instanceof APIException) {
    properties[key('api_status_code')] = error.statusCode;
    properties[key('api_error_code')] = error.name;
    const validation = error.details
      ? flattenValidationErrors(error.details)
      : [];
    if (validation.length > 0) {
      properties[key('api_validation_errors')] = validation;
    }
    if (error.details) {
      properties[key('api_details')] = sanitizeValue(error.details);
    }
  }

  if (error instanceof MultipartUploadError) {
    properties[key('upload_attempts')] = error.attempts;
    properties[key('upload_category')] = error.category;
    if (error.lastStatus != null) {
      properties[key('upload_http_status')] = error.lastStatus;
    }
    if (error.requestId) {
      properties[key('upload_request_id')] = error.requestId;
    }
    if (error.hostId) {
      properties[key('upload_host_id')] = error.hostId;
    }
  }

  if (error && typeof error === 'object') {
    const native = error as Record<string, unknown>;
    copyIfPresent(properties, native, 'code', key('native_code'));
    copyIfPresent(properties, native, 'domain', key('native_domain'));
    copyIfPresent(properties, native, 'userInfo', key('native_user_info'));
    if (Array.isArray(native.nativeStackIOS) && native.nativeStackIOS.length) {
      properties[key('native_stack')] = truncate(
        native.nativeStackIOS.map(String).join('\n'),
      );
    }
    if (
      Array.isArray(native.nativeStackAndroid) &&
      native.nativeStackAndroid.length
    ) {
      properties[key('native_stack')] = truncate(
        native.nativeStackAndroid.map(String).join('\n'),
      );
    }
  }

  const cause = getCause(error);
  if (cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    Object.assign(
      properties,
      serializeUnknown(cause, depth + 1, prefix ? `${prefix}_cause` : 'cause'),
    );
  }

  return properties;
}

function getCause(error: unknown): unknown {
  if (error instanceof Error && 'cause' in error) {
    return (error as Error & {cause?: unknown}).cause;
  }
  if (error && typeof error === 'object' && 'cause' in error) {
    return (error as {cause?: unknown}).cause;
  }
  return undefined;
}

function copyIfPresent(
  target: SerializedError,
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey: string,
): void {
  if (!(sourceKey in source) || source[sourceKey] === undefined) {
    return;
  }
  target[targetKey] = sanitizeValue(source[sourceKey]);
}

export function sanitizeContext(
  context?: Record<string, unknown>,
  prefix = '',
): SerializedError {
  if (!context) {
    return {};
  }

  const properties: SerializedError = {};
  for (const [rawKey, value] of Object.entries(context)) {
    if (value === undefined) {
      continue;
    }
    const key = prefix ? `${prefix}_${rawKey}` : rawKey;
    properties[key] = sanitizeValue(value, rawKey);
  }
  return properties;
}

function sanitizeValue(value: unknown, key = ''): unknown {
  if (REDACT_KEY.test(key)) {
    return '[redacted]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(item => sanitizeValue(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[childKey] = sanitizeValue(childValue, childKey);
    }
    return result;
  }
  return truncate(String(value));
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING) {
    return value;
  }
  return `${value.slice(0, MAX_STRING)}…`;
}
