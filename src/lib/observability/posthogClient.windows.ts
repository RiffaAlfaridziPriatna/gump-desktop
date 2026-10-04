import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@lib/config/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import type {ErrorCaptureClient} from './reportError';
import {setErrorCaptureClient} from './reportError';

/**
 * Windows PostHog client using the public Capture HTTP API only
 * (no posthog-react-native). Shape follows:
 * - https://posthog.com/docs/api/capture
 * - https://posthog.com/docs/error-tracking/installation/manual
 */

const DISTINCT_ID_KEY = '@gump/posthog.distinct_id';
const ANON_ID_KEY = '@gump/posthog.anonymous_id';
const MAX_EXCEPTION_STEPS = 32;
const MAX_EXCEPTION_STEP_BYTES = 32_768;
const LIB_NAME = 'gump-windows-http';

type PropertyValue = string | number | boolean | null;
type Properties = Record<string, PropertyValue | unknown>;

/** Batch event shape from PostHog Capture API docs. */
type CaptureEvent = {
  event: string;
  distinct_id: string;
  properties: Properties;
  timestamp: string;
};

type ExceptionStep = {
  $message: string;
  $timestamp: string;
  [key: string]: PropertyValue;
};

type StackFrame = {
  platform: 'custom';
  lang: 'javascript';
  function: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
};

export const isPostHogEnabled = POSTHOG_API_KEY.length > 0;

export function appBuildProperties(): Record<string, string> {
  return {
    appVersion: APP_VERSION,
    appBuildId: APP_BUILD_ID,
    gitSha: GIT_SHA,
    platform: Platform.OS,
  };
}

let distinctId = createId();
let anonymousId = distinctId;
let identified = false;
let ready = false;
let readyPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

const queue: CaptureEvent[] = [];
const exceptionSteps: ExceptionStep[] = [];
let exceptionStepsBytes = 0;
const superProperties: Record<string, PropertyValue> = {
  ...appBuildProperties(),
  $lib: LIB_NAME,
};

export const posthog: ErrorCaptureClient | null = isPostHogEnabled
  ? {
      captureException(error, additionalProperties) {
        captureException(error, additionalProperties);
      },
    }
  : null;

if (posthog) {
  setErrorCaptureClient(posthog);
  void ensureReady();
}

export function identifyUser(user: {
  id: string;
  email?: string | null;
  name?: string;
  role?: string;
}): void {
  if (!isPostHogEnabled || !user.id) {
    return;
  }

  void (async () => {
    await ensureReady();

    const personProperties: Record<string, string> = {
      ...appBuildProperties(),
    };
    if (user.email) {
      personProperties.email = user.email;
    }
    if (user.name) {
      personProperties.name = user.name;
    }
    if (user.role) {
      personProperties.role = user.role;
    }

    Object.assign(superProperties, appBuildProperties());

    const previousDistinctId = distinctId;
    const wasAnonymous = !identified && previousDistinctId !== user.id;

    // Capture API: merge anon → identified via $create_alias
    // (distinct_id = previous id, alias = surviving id).
    // https://posthog.com/docs/api/capture#alias
    if (wasAnonymous) {
      enqueue('$create_alias', previousDistinctId, {
        alias: user.id,
      });
    }

    distinctId = user.id;
    identified = true;
    await persistIds();

    // Capture API: $identify updates person properties with $set.
    // https://posthog.com/docs/api/capture#identify
    enqueue('$identify', user.id, {
      $set: personProperties,
    });
    scheduleFlush(true);
  })();
}

export function resetIdentifiedUser(): void {
  if (!isPostHogEnabled) {
    return;
  }

  void (async () => {
    await ensureReady();
    anonymousId = createId();
    distinctId = anonymousId;
    identified = false;
    clearExceptionSteps();
    await persistIds();
  })();
}

export function addErrorStep(
  message: string,
  properties?: Record<string, PropertyValue>,
): void {
  if (!isPostHogEnabled || message.trim().length === 0) {
    return;
  }

  try {
    const step: ExceptionStep = {
      $message: message,
      $timestamp: new Date().toISOString(),
      ...(sanitizeStepProperties(properties) ?? {}),
    };
    const size = roughSize(step);
    while (
      exceptionSteps.length > 0 &&
      (exceptionSteps.length >= MAX_EXCEPTION_STEPS ||
        exceptionStepsBytes + size > MAX_EXCEPTION_STEP_BYTES)
    ) {
      const removed = exceptionSteps.shift();
      if (removed) {
        exceptionStepsBytes = Math.max(
          0,
          exceptionStepsBytes - roughSize(removed),
        );
      }
    }
    exceptionSteps.push(step);
    exceptionStepsBytes += size;
  } catch {
    // Never throw from tracing.
  }
}

export function captureAppEvent(
  event: string,
  properties?: Record<string, PropertyValue>,
): void {
  if (!isPostHogEnabled || event.trim().length === 0) {
    return;
  }

  try {
    enqueue(event, distinctId, {
      ...appBuildProperties(),
      ...properties,
    });
    scheduleFlush(true);
  } catch {
    // Never throw from tracing.
  }
}

function captureException(
  error: Error | unknown,
  additionalProperties?: Record<string, unknown>,
): void {
  if (!isPostHogEnabled) {
    return;
  }

  try {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown error');

    const steps =
      exceptionSteps.length > 0 ? [...exceptionSteps] : undefined;
    clearExceptionSteps();

    const frames = err.stack ? parseStackFrames(err.stack) : [];

    // Manual Error Tracking installation schema:
    // https://posthog.com/docs/error-tracking/installation/manual
    enqueue('$exception', distinctId, {
      ...appBuildProperties(),
      ...additionalProperties,
      $exception_list: [
        {
          type: err.name || 'Error',
          value: err.message || 'Unknown error',
          mechanism: {
            handled: true,
            synthetic: false,
          },
          ...(frames.length > 0
            ? {
                stacktrace: {
                  type: 'raw',
                  frames,
                },
              }
            : {}),
        },
      ],
      ...(steps ? {$exception_steps: steps} : {}),
    });
    scheduleFlush(true);
  } catch {
    // Never throw from tracing.
  }
}

function enqueue(
  event: string,
  eventDistinctId: string,
  properties: Properties,
): void {
  queue.push({
    event,
    // Prefer top-level distinct_id per Capture API docs.
    distinct_id: eventDistinctId,
    timestamp: new Date().toISOString(),
    properties: {
      ...superProperties,
      ...properties,
      // Anonymous custom events should not create/update person profiles.
      // Skip $-system events ($create_alias, $identify, $exception, …).
      // https://posthog.com/docs/api/capture#anonymous-event-capture
      ...(!identified &&
      eventDistinctId === anonymousId &&
      !event.startsWith('$')
        ? {$process_person_profile: false}
        : {}),
    },
  });
}

function scheduleFlush(immediate = false): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushTimer = setTimeout(
    () => {
      flushTimer = null;
      void flush();
    },
    immediate ? 0 : 250,
  );
}

async function flush(): Promise<void> {
  if (!isPostHogEnabled || flushing || queue.length === 0) {
    return;
  }

  await ensureReady();
  flushing = true;
  const batch = queue.splice(0, queue.length);

  try {
    const host = POSTHOG_HOST.replace(/\/$/, '');
    // https://posthog.com/docs/api/capture#batch-events
    await fetch(`${host}/batch/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        batch,
      }),
    });
  } catch {
    // Drop failed batch — never block the UI on analytics.
  } finally {
    flushing = false;
    if (queue.length > 0) {
      scheduleFlush();
    }
  }
}

async function ensureReady(): Promise<void> {
  if (!isPostHogEnabled || ready) {
    return;
  }
  if (!readyPromise) {
    readyPromise = loadPersistedIds().finally(() => {
      ready = true;
    });
  }
  await readyPromise;
}

async function loadPersistedIds(): Promise<void> {
  try {
    const [storedDistinct, storedAnon] = await Promise.all([
      AsyncStorage.getItem(DISTINCT_ID_KEY),
      AsyncStorage.getItem(ANON_ID_KEY),
    ]);

    if (storedAnon) {
      anonymousId = storedAnon;
    }
    if (storedDistinct) {
      distinctId = storedDistinct;
      identified = storedDistinct !== anonymousId;
    } else {
      distinctId = anonymousId;
      await persistIds();
    }
  } catch {
    // Keep in-memory ids.
  }
}

async function persistIds(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(DISTINCT_ID_KEY, distinctId),
      AsyncStorage.setItem(ANON_ID_KEY, anonymousId),
    ]);
  } catch {
    // Persistence is best-effort.
  }
}

function clearExceptionSteps(): void {
  exceptionSteps.length = 0;
  exceptionStepsBytes = 0;
}

function sanitizeStepProperties(
  properties?: Record<string, PropertyValue>,
): Record<string, PropertyValue> | undefined {
  if (!properties) {
    return undefined;
  }
  const sanitized: Record<string, PropertyValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (key === '$message' || key === '$timestamp') {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function roughSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const line of stack.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Error')) {
      continue;
    }

    const withParens = trimmed.match(
      /^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/,
    );
    if (withParens) {
      frames.push({
        platform: 'custom',
        lang: 'javascript',
        function: withParens[1],
        filename: withParens[2],
        lineno: Number(withParens[3]),
        colno: Number(withParens[4]),
        in_app: true,
      });
      continue;
    }

    const bare = trimmed.match(/^at\s+(.+?):(\d+):(\d+)$/);
    if (bare) {
      frames.push({
        platform: 'custom',
        lang: 'javascript',
        function: '<anonymous>',
        filename: bare[1],
        lineno: Number(bare[2]),
        colno: Number(bare[3]),
        in_app: true,
      });
      continue;
    }

    frames.push({
      platform: 'custom',
      lang: 'javascript',
      function: trimmed.replace(/^at\s+/, '') || '<anonymous>',
      in_app: true,
    });
  }

  return frames.reverse();
}

function createId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
