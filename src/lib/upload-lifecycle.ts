import { EXTRACTION_CONCURRENCY } from "./bounded-concurrency";

export type StagedDocument = { id: string; fileName: string };

export type StageResult<T> = {
  staged: StagedDocument[];
  failed: string[];
  items: T[];
};

/**
 * Phase 1 of the upload lifecycle: upload every selected file to storage and
 * create its `documents` row. Extraction is deliberately NOT part of this
 * phase, so the "Загрузка…" UI state ends as soon as staging is done.
 *
 * A failure on one file never prevents later files from being staged.
 */
export const STAGING_CONCURRENCY = 3;
export const STAGING_MAX_ATTEMPTS = 3;

const stageRetryDelay = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, attempt * 250));

export async function stageDocuments<T>(
  items: T[],
  stage: (item: T) => Promise<StagedDocument>,
  options: {
    getName: (item: T) => string;
    onStaged?: (staged: StagedDocument | null, item: T) => Promise<void> | void;
    concurrency?: number;
    maxAttempts?: number;
  },
): Promise<StageResult<T>> {
  if (items.length === 0) return { staged: [], failed: [], items };
  const results: Array<StagedDocument | null> = new Array(items.length).fill(null);
  const failures: Array<string | null> = new Array(items.length).fill(null);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? STAGING_CONCURRENCY, STAGING_CONCURRENCY));
  const maxAttempts = Math.max(1, options.maxAttempts ?? STAGING_MAX_ATTEMPTS);
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      const name = options.getName(item);
      let result: StagedDocument | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          result = await stage(item);
          results[index] = result;
          break;
        } catch (error) {
          lastError = error;
          console.error('[upload-lifecycle] staging attempt failed', name, attempt, error);
          if (attempt < maxAttempts) await stageRetryDelay(attempt);
        }
      }
      if (!result) {
        failures[index] = name;
        console.error('[upload-lifecycle] staging permanently failed', name, lastError);
      }
      if (options.onStaged) await options.onStaged(result, item);
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => worker()));
  return {
    staged: results.filter((x): x is StagedDocument => x !== null),
    failed: failures.filter((x): x is string => x !== null),
    items,
  };
}

/**
 * Process-wide extraction limiter. Bounded concurrency inside a single call is
 * not enough: two overlapping upload batches would each run up to 3 workers.
 * This semaphore is shared by every `runBackgroundExtraction` invocation, so
 * the combined in-flight extraction count never exceeds EXTRACTION_CONCURRENCY.
 */
class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const extractionSemaphore = new Semaphore(EXTRACTION_CONCURRENCY);

export function runBackgroundExtraction(
  staged: StagedDocument[],
  extract: (doc: StagedDocument) => Promise<{ ok: boolean }>,
  options: {
    isProcessing?: (documentId: string) => boolean;
    onStart?: (ids: string[]) => void;
    onSettled?: (doc: StagedDocument, ok: boolean) => Promise<void> | void;
    onFinish?: (issues: string[]) => Promise<void> | void;
  } = {},
): Promise<string[]> {
  const queue = staged.filter((doc) => !options.isProcessing?.(doc.id));
  options.onStart?.(queue.map((doc) => doc.id));

  const issues: string[] = [];

  const run = async (doc: StagedDocument) => {
    await extractionSemaphore.acquire();
    try {
      let ok = false;
      try {
        ok = (await extract(doc)).ok;
      } catch (error) {
        console.error("[upload-lifecycle] extraction failed", doc.fileName, error);
        ok = false;
      }
      if (!ok) issues.push(doc.fileName);
      if (options.onSettled) await options.onSettled(doc, ok);
    } finally {
      extractionSemaphore.release();
    }
  };

  return Promise.all(queue.map(run)).then(async () => {
    if (options.onFinish) await options.onFinish(issues);
    return issues;
  });
}
