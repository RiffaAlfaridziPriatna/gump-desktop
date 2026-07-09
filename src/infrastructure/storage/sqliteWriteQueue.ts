let writeChain: Promise<void> = Promise.resolve();

export function enqueueSQLiteWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = writeChain.then(work, work);
  writeChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function drainSQLiteWrites(): Promise<void> {
  await writeChain;
}
