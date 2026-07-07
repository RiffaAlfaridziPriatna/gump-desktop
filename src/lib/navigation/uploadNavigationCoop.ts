const deferred: Array<() => void> = [];
let coopDepth = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let navigationPriorityUntil = 0;

const COOP_SAFETY_MS = 1000;
const FLUSH_STEP_MS = 32;
const NAVIGATION_PRIORITY_MS = 600;

function flushDeferred(): void {
  const pending = deferred.splice(0);
  if (pending.length === 0) {
    return;
  }

  let index = 0;

  const step = () => {
    if (index >= pending.length) {
      return;
    }

    pending[index]!();
    index++;

    if (index < pending.length) {
      setTimeout(step, FLUSH_STEP_MS);
    }
  };

  queueMicrotask(step);
}

export function isUploadNavigationActive(): boolean {
  return coopDepth > 0;
}

export function shouldYieldUploadQueueForNavigation(): boolean {
  return Date.now() < navigationPriorityUntil || isUploadNavigationActive();
}

export function prioritizeNavigationInteraction(
  durationMs = NAVIGATION_PRIORITY_MS,
): void {
  navigationPriorityUntil = Date.now() + durationMs;
}

export function beginUploadNavigationCoop(): void {
  coopDepth++;

  if (safetyTimer) {
    clearTimeout(safetyTimer);
  }

  safetyTimer = setTimeout(() => {
    if (coopDepth > 0) {
      coopDepth = 0;
      flushDeferred();
    }
    safetyTimer = null;
  }, COOP_SAFETY_MS);
}

export function endUploadNavigationCoop(): void {
  if (coopDepth === 0) {
    return;
  }

  coopDepth--;
  if (coopDepth > 0) {
    return;
  }

  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }

  flushDeferred();
}

export function runDeferredDuringUploadNavigation(work: () => void): void {
  if (!isUploadNavigationActive()) {
    work();
    return;
  }
  deferred.push(work);
}
