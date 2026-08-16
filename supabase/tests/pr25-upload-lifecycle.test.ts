import { describe, expect, it } from "bun:test";
import {
  runBackgroundExtraction,
  stageDocuments,
  type StagedDocument,
} from "../../src/lib/upload-lifecycle";
import { EXTRACTION_CONCURRENCY } from "../../src/lib/bounded-concurrency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("PR25 staging lifecycle", () => {
  it("resolves staging before any extraction completes", async () => {
    const files = Array.from({ length: 6 }, (_, i) => `f-${i + 1}`);
    let uploading = true;

    const { staged, failed } = await stageDocuments(
      files,
      async (name) => {
        await sleep(1);
        return { id: `id-${name}`, fileName: name };
      },
      { getName: (n) => n },
    );
    uploading = false;

    expect(staged.length).toBe(6);
    expect(failed).toEqual([]);
    expect(uploading).toBe(false);

    let extractionsDone = 0;
    const bg = runBackgroundExtraction(
      staged,
      async () => {
        await sleep(20);
        extractionsDone += 1;
        return { ok: true };
      },
    );

    // Upload UI is already unlocked while extraction is still running.
    expect(extractionsDone).toBeLessThan(6);
    await bg;
    expect(extractionsDone).toBe(6);
  });

  it("a slow/failing extraction does not lock staging of a new batch", async () => {
    const first = await stageDocuments(["slow.pdf"], async (n) => ({ id: "slow", fileName: n }), {
      getName: (n) => n,
    });

    let finished = false;
    const bg = runBackgroundExtraction(first.staged, async () => {
      await sleep(60);
      throw new Error("504");
    }, { onFinish: () => { finished = true; } });

    // Second batch can be staged while the first extraction is still pending.
    const second = await stageDocuments(["a.pdf", "b.pdf"], async (n) => ({ id: n, fileName: n }), {
      getName: (n) => n,
    });
    expect(second.staged.length).toBe(2);
    expect(finished).toBe(false);

    const issues = await bg;
    expect(issues).toEqual(["slow.pdf"]);
    expect(finished).toBe(true);
  });

  it("staging failure of one file does not block later files", async () => {
    const { staged, failed } = await stageDocuments(
      ["a", "bad", "c"],
      async (n) => {
        if (n === "bad") throw new Error("upload failed");
        return { id: n, fileName: n };
      },
      { getName: (n) => n },
    );
    expect(staged.map((s) => s.fileName)).toEqual(["a", "c"]);
    expect(failed).toEqual(["bad"]);
  });
});

describe("PR25 background extraction", () => {
  it("stays within bounded concurrency of 3", async () => {
    const staged: StagedDocument[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      fileName: `d${i}.pdf`,
    }));
    let inFlight = 0;
    let peak = 0;
    await runBackgroundExtraction(staged, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(3);
      inFlight -= 1;
      return { ok: true };
    });
    expect(EXTRACTION_CONCURRENCY).toBe(3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("never starts duplicate extraction for a document already processing", async () => {
    const seen: string[] = [];
    const processing = new Set(["dup"]);
    const issues = await runBackgroundExtraction(
      [
        { id: "dup", fileName: "dup.pdf" },
        { id: "new", fileName: "new.pdf" },
      ],
      async (doc) => {
        seen.push(doc.id);
        return { ok: true };
      },
      { isProcessing: (id) => processing.has(id) },
    );
    expect(seen).toEqual(["new"]);
    expect(issues).toEqual([]);
  });

  it("reports per-document settle events independently", async () => {
    const settled: Array<[string, boolean]> = [];
    const issues = await runBackgroundExtraction(
      [
        { id: "1", fileName: "ok.pdf" },
        { id: "2", fileName: "bad.pdf" },
      ],
      async (doc) => ({ ok: doc.fileName === "ok.pdf" }),
      { onSettled: (doc, ok) => { settled.push([doc.fileName, ok]); } },
    );
    expect(settled.length).toBe(2);
    expect(issues).toEqual(["bad.pdf"]);
  });
});

describe("PR25 global extraction concurrency", () => {
  it("caps combined in-flight workers at 3 across two overlapping calls", async () => {
    const batch = (p: string) =>
      Array.from({ length: 6 }, (_, i) => ({ id: `${p}${i}`, fileName: `${p}${i}.pdf` }));

    let inFlight = 0;
    let peak = 0;
    const work = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight -= 1;
      return { ok: true };
    };

    const a = runBackgroundExtraction(batch("a"), work);
    const b = runBackgroundExtraction(batch("b"), work);
    const [ia, ib] = await Promise.all([a, b]);

    expect(peak).toBeLessThanOrEqual(EXTRACTION_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
    expect(ia).toEqual([]);
    expect(ib).toEqual([]);
    expect(inFlight).toBe(0);
  });

  it("releases the global slot even when extraction throws", async () => {
    const failing = runBackgroundExtraction(
      [{ id: "x", fileName: "x.pdf" }],
      async () => {
        throw new Error("boom");
      },
    );
    expect(await failing).toEqual(["x.pdf"]);

    let ran = false;
    await runBackgroundExtraction([{ id: "y", fileName: "y.pdf" }], async () => {
      ran = true;
      return { ok: true };
    });
    expect(ran).toBe(true);
  });
});
