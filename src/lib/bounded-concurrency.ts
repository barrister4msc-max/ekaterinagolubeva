/**
 * Maximum number of concurrent document extraction jobs.
 * Bounded on purpose: never run every selected document at once.
 */
export const EXTRACTION_CONCURRENCY = 3;

/**
 * Runs `worker` over `items` with at most `limit` tasks in flight.
 * Results preserve input order. Worker rejections are propagated per item
 * only if the worker itself throws — callers should handle errors inside.
 */
export async function runWithBoundedConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit) || 1, EXTRACTION_CONCURRENCY));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index] as T, index);
    }
  });

  await Promise.all(runners);
  return results;
}
