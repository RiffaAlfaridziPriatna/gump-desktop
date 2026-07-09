const deferred: Array<() => void> = [];
let coopDepth = 0;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let navigationPriorityUntil = 0;

const COOP_SAFETY_MS = 30_000;
const FLUSH_STEP_MS = 16;
const NAVIGATION_PRIORITY_MS = 600;
const DEFERRED_FLUSH_DELAY_MS = 300;

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
  return isUploadNavigationActive();
}

export function shouldDeferHeavyWorkForNavigation(): boolean {
  return Date.now() < navigationPriorityUntil || isUploadNavigationActive();
}

export function prioritizeNavigationInteraction(
  durationMs = NAVIGATION_PRIORITY_MS,
): void {
  navigationPriorityUntil = Date.now() + durationMs;
}

export function clearNavigationInteractionPriority(): void {
  navigationPriorityUntil = 0;
}

export function beginUploadNavigationCoop(): void {
  coopDepth++;

  if (safetyTimer) {
    clearTimeout(safetyTimer);
  }

  safetyTimer = setTimeout(() => {
    if (coopDepth > 0) {
      coopDepth = 0;
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

  clearNavigationInteractionPriority();
  setTimeout(() => flushDeferred(), DEFERRED_FLUSH_DELAY_MS);
}

export function runDeferredDuringUploadNavigation(work: () => void): void {
  if (!isUploadNavigationActive()) {
    work();
    return;
  }
  deferred.push(work);
}

export function runOrDeferHeavyWorkForNavigation(work: () => void): void {
  if (!shouldDeferHeavyWorkForNavigation()) {
    work();
    return;
  }
  deferred.push(work);
}
