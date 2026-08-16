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
export async function stageDocuments<T>(
  items: T[],
  stage: (item: T) => Promise<StagedDocument>,
  options: {
    getName: (item: T) => string;
    onStaged?: (staged: StagedDocument | null, item: T) => Promise<void> | void;
  },
): Promise<StageResult<T>> {
  const staged: StagedDocument[] = [];
  const failed: string[] = [];

  for (const item of items) {
    let result: StagedDocument | null = null;
    try {
      result = await stage(item);
      staged.push(result);
    } catch (error) {
      console.error("[upload-lifecycle] staging failed", options.getName(item), error);
      failed.push(options.getName(item));
    }
    if (options.onStaged) await options.onStaged(result, item);
  }

  return { staged, failed, items };
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
