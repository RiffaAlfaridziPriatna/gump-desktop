type IdleWorkOptions = {
  timeoutMs?: number;
};

export function scheduleIdleWork(
  work: () => void,
  options: IdleWorkOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? 2000;

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => work(), {timeout: timeoutMs});
    return;
  }

  setTimeout(work, 0);
}
