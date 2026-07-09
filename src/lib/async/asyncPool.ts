export async function runTasksWithConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]!, index);
    }
  }

  const workerCount = Math.min(maxConcurrent, items.length);
  await Promise.all(Array.from({length: workerCount}, () => worker()));

  return results;
}

