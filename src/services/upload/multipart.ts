import {NativeModules} from 'react-native';
import {readFileSlice} from '@services/upload/types';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MULTIPLIER = 2;
const MAX_DELAY_MS = 8000;
const MAX_RETRY_AFTER_MS = 30_000;
const PART_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504];

type UploadPart = {url: string; num: number; start: number; end: number};
type UploadedPart = {num: number; eTag: string};

type NativeFileUploader = {
  uploadFilePart: (
    uri: string,
    start: number,
    end: number,
    uploadUrl: string,
  ) => Promise<{eTag: string}>;
};

const NativeFileUploader = NativeModules.GumpLocalStorage as
  | NativeFileUploader
  | undefined;

type RetryCategory = 'network' | 'http' | 'timeout';

export class MultipartUploadError extends Error {
  readonly attempts: number;
  readonly category: RetryCategory;
  readonly lastStatus?: number;
  readonly requestId?: string;
  readonly hostId?: string;

  constructor(params: {
    attempts: number;
    category: RetryCategory;
    lastStatus?: number;
    requestId?: string;
    hostId?: string;
  }) {
    const message = params.lastStatus
      ? `Upload failed (HTTP ${params.lastStatus})`
      : `Upload failed (${params.category})`;
    super(message);
    this.name = 'MultipartUploadError';
    this.attempts = params.attempts;
    this.category = params.category;
    this.lastStatus = params.lastStatus;
    this.requestId = params.requestId;
    this.hostId = params.hostId;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return Math.min(Math.max(0, asNumber * 1000), MAX_RETRY_AFTER_MS);
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(0, asDate - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

function delay(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), ms);
  });
}

export async function uploadPart(
  part: UploadPart,
  body: Blob,
): Promise<UploadedPart> {
  let lastCategory: RetryCategory = 'network';
  let lastStatus: number | undefined;
  let requestId: string | undefined;
  let hostId: string | undefined;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PART_TIMEOUT_MS);

    let retryAfterMs: number | undefined;

    try {
      let response: Response;
      try {
        response = await fetch(part.url, {
          method: 'PUT',
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        const rawETag = response.headers.get('ETag');
        const cleaned = rawETag?.replaceAll('"', '') ?? '';
        if (!cleaned) {
          lastCategory = 'http';
          const newRequestId = response.headers.get('x-amz-request-id');
          if (newRequestId) requestId = newRequestId;
          const newHostId = response.headers.get('x-amz-id-2');
          if (newHostId) hostId = newHostId;
        } else {
          return {num: part.num, eTag: cleaned};
        }
      } else if (RETRYABLE_STATUSES.includes(response.status)) {
        lastCategory = 'http';
        lastStatus = response.status;
        const newRequestId = response.headers.get('x-amz-request-id');
        if (newRequestId) requestId = newRequestId;
        const newHostId = response.headers.get('x-amz-id-2');
        if (newHostId) hostId = newHostId;
        if (response.status === 429 || response.status === 503) {
          retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
        }
      } else if (response.status === 400) {
        const newRequestId = response.headers.get('x-amz-request-id');
        const newHostId = response.headers.get('x-amz-id-2');
        let bodyText = '';
        try {
          bodyText = await response.text();
        } catch {
          // ignore
        }
        if (/<Code>\s*RequestTimeout\s*<\/Code>/.test(bodyText)) {
          lastCategory = 'http';
          lastStatus = 400;
          if (newRequestId) requestId = newRequestId;
          if (newHostId) hostId = newHostId;
        } else {
          throw new MultipartUploadError({
            attempts: attempt + 1,
            category: 'http',
            lastStatus: 400,
            requestId: newRequestId ?? undefined,
            hostId: newHostId ?? undefined,
          });
        }
      } else {
        throw new MultipartUploadError({
          attempts: attempt + 1,
          category: 'http',
          lastStatus: response.status,
          requestId: response.headers.get('x-amz-request-id') ?? undefined,
          hostId: response.headers.get('x-amz-id-2') ?? undefined,
        });
      }
    } catch (err) {
      if (err instanceof MultipartUploadError) throw err;
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        lastCategory = 'timeout';
      } else {
        lastCategory = 'network';
      }
    }

    const isFinalAttempt = attempt === MAX_ATTEMPTS - 1;
    if (isFinalAttempt) break;

    const computedDelay =
      Math.random() *
      Math.min(MAX_DELAY_MS, BASE_DELAY_MS * MULTIPLIER ** attempt);
    const waitMs =
      retryAfterMs !== undefined
        ? Math.max(retryAfterMs, computedDelay)
        : computedDelay;
    await delay(waitMs);
  }

  throw new MultipartUploadError({
    attempts: MAX_ATTEMPTS,
    category: lastCategory,
    lastStatus,
    requestId,
    hostId,
  });
}

export async function uploadPartFromFile(
  fileUri: string,
  part: UploadPart,
): Promise<UploadedPart> {
  if (NativeFileUploader?.uploadFilePart) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await NativeFileUploader.uploadFilePart(
          fileUri,
          part.start,
          part.end,
          part.url,
        );
        return {num: part.num, eTag: result.eTag};
      } catch (err) {
        if (attempt === MAX_ATTEMPTS - 1) {
          throw err;
        }
        await delay(
          Math.random() *
            Math.min(MAX_DELAY_MS, BASE_DELAY_MS * MULTIPLIER ** attempt),
        );
      }
    }
  }

  const body = await readFileSlice(fileUri, part.start, part.end);
  return uploadPart(part, body);
}
