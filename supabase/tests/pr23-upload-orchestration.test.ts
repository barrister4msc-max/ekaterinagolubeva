import { describe, expect, it } from "bun:test";
import {
  EXTRACTION_CONCURRENCY,
  runWithBoundedConcurrency,
} from "../../src/lib/bounded-concurrency";
import { expandSelectedDocumentFiles } from "../../src/lib/document-package-files";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("bounded concurrency helper", () => {
  it("caps in-flight work at the requested limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runWithBoundedConcurrency(items, 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight -= 1;
      return item;
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("never exceeds the project extraction cap of 3", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithBoundedConcurrency(Array.from({ length: 8 }, (_, i) => i), 99, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(3);
      inFlight -= 1;
    });
    expect(EXTRACTION_CONCURRENCY).toBe(3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("preserves result order", async () => {
    const out = await runWithBoundedConcurrency([1, 2, 3, 4, 5], 3, async (n) => {
      await sleep(n % 2 === 0 ? 1 : 6);
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("handles an empty list", async () => {
    expect(await runWithBoundedConcurrency([], 3, async () => 1)).toEqual([]);
  });
});

describe("upload orchestration order (generic N, no product limit)", () => {
  // Structural simulation of handleUploadDocument: stage all files first,
  // then extract with bounded concurrency. N is arbitrary — there is no
  // product limit on how many ordinary files a user may select.
  async function simulate(fileNames: string[], failUpload: string[] = []) {
    const events: string[] = [];
    const staged: Array<{ id: string; fileName: string }> = [];
    const failed: string[] = [];
    let peak = 0;
    let inFlight = 0;

    for (const file of fileNames) {
      try {
        if (failUpload.includes(file)) throw new Error("upload failed");
        await sleep(1);
        events.push(`stage:${file}`);
        staged.push({ id: `id-${file}`, fileName: file });
      } catch {
        failed.push(file);
      }
    }

    const issues: string[] = [];
    await runWithBoundedConcurrency(staged, EXTRACTION_CONCURRENCY, async (doc) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      events.push(`extract:${doc.fileName}`);
      await sleep(2);
      if (doc.fileName.endsWith("-slow")) issues.push(doc.fileName);
      inFlight -= 1;
    });

    const firstExtract = events.findIndex((e) => e.startsWith("extract:"));
    const lastStage = events.map((e) => e.startsWith("stage:")).lastIndexOf(true);

    return { events, staged, failed, issues, peak, firstExtract, lastStage };
  }

  it("stages every file before any extraction starts (N = 4)", async () => {
    const r = await simulate(["a", "b-slow", "c", "d"], ["c"]);
    expect(r.lastStage).toBeLessThan(r.firstExtract);
    // Upload failure of one file does not block later files.
    expect(r.staged.map((d) => d.fileName)).toEqual(["a", "b-slow", "d"]);
    expect(r.failed).toEqual(["c"]);
    // Extraction issues are collected independently.
    expect(r.issues).toEqual(["b-slow"]);
    expect(r.peak).toBeLessThanOrEqual(EXTRACTION_CONCURRENCY);
  });

  it("stages every file before any extraction starts (N = 17)", async () => {
    const names = Array.from({ length: 17 }, (_, i) => `doc-${i + 1}`);
    const r = await simulate(names);
    expect(r.staged.length).toBe(17);
    expect(r.lastStage).toBeLessThan(r.firstExtract);
    expect(r.events.filter((e) => e.startsWith("extract:")).length).toBe(17);
    // Extraction stays bounded regardless of how many files were selected.
    expect(r.peak).toBeLessThanOrEqual(EXTRACTION_CONCURRENCY);
  });

  it("reports the count of successfully staged documents, not the selection size", async () => {
    const names = Array.from({ length: 23 }, (_, i) => `f-${i + 1}`);
    const r = await simulate(names, ["f-4", "f-19"]);
    expect(r.staged.length).toBe(21);
    expect(r.failed).toEqual(["f-4", "f-19"]);
  });
});

describe("ordinary multi-file selection has no count limit", () => {
  it("passes through any number of ordinary (non-ZIP) files", async () => {
    const many = Array.from(
      { length: 42 },
      (_, i) => new File([`text ${i}`], `file-${i + 1}.pdf`, { type: "application/pdf" }),
    );
    const expanded = await expandSelectedDocumentFiles(many);
    expect(expanded.files.length).toBe(42);
    expect(expanded.expandedArchives).toEqual([]);
    expect(expanded.skippedEntries).toEqual([]);
  });
});

