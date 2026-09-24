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
 * PostHog React Native is unsupported on Windows. This module talks to the
 * PostHog Capture HTTP API directly so analytics still works without the SDK.
 */

const DISTINCT_ID_KEY = '@gump/posthog.distinct_id';
const ANON_ID_KEY = '@gump/posthog.anonymous_id';
const MAX_EXCEPTION_STEPS = 32;
const MAX_EXCEPTION_STEP_BYTES = 32_768;
const LIB_NAME = 'gump-windows-http';

type PropertyValue = string | number | boolean | null;
type Properties = Record<string, PropertyValue | unknown>;

type CaptureEvent = {
  event: string;
  properties: Properties;
  timestamp: string;
};

type ExceptionStep = {
  $message: string;
  $timestamp: string;
  [key: string]: PropertyValue;
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

    const properties: Record<string, string> = {...appBuildProperties()};
    if (user.email) {
      properties.email = user.email;
    }
    if (user.name) {
      properties.name = user.name;
    }
    if (user.role) {
      properties.role = user.role;
    }

    Object.assign(superProperties, appBuildProperties());

    const previousDistinctId = distinctId;
    const wasAnonymous = !identified;
    distinctId = user.id;
    identified = true;

    await persistIds();

    enqueue('$identify', {
      ...(wasAnonymous ? {$anon_distinct_id: previousDistinctId} : {}),
      $set: properties,
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
        exceptionStepsBytes = Math.max(0, exceptionStepsBytes - roughSize(removed));
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
    enqueue(event, {...appBuildProperties(), ...properties});
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

    enqueue('$exception', {
      ...appBuildProperties(),
      ...additionalProperties,
      $exception_level: 'error',
      $exception_list: [
        {
          type: err.name || 'Error',
          value: err.message || 'Unknown error',
          mechanism: {
            type: 'generic',
            handled: true,
            synthetic: false,
          },
          ...(err.stack
            ? {
                stacktrace: {
                  type: 'raw',
                  frames: parseStackFrames(err.stack),
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

function enqueue(event: string, properties: Properties): void {
  queue.push({
    event,
    timestamp: new Date().toISOString(),
    properties: {
      ...superProperties,
      ...properties,
      distinct_id: distinctId,
      token: POSTHOG_API_KEY,
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

  // Stamp current distinct_id in case identify raced with enqueue.
  for (const item of batch) {
    item.properties.distinct_id = distinctId;
  }

  try {
    const host = POSTHOG_HOST.replace(/\/$/, '');
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

function parseStackFrames(stack: string): Array<{
  platform: string;
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
  raw_id?: string;
}> {
  const frames: Array<{
    platform: string;
    filename?: string;
    function?: string;
    lineno?: number;
    colno?: number;
    in_app: boolean;
    raw_id?: string;
  }> = [];

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
        platform: 'javascript',
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
        platform: 'javascript',
        filename: bare[1],
        lineno: Number(bare[2]),
        colno: Number(bare[3]),
        in_app: true,
      });
      continue;
    }

    frames.push({
      platform: 'javascript',
      function: trimmed.replace(/^at\s+/, ''),
      in_app: true,
      raw_id: trimmed,
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
