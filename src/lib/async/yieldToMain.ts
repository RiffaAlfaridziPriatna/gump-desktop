export function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), {timeout: 32});
    } else {
      setTimeout(resolve, 0);
    }
  });
}
