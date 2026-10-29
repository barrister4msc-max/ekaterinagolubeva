import { describe, expect, test } from "bun:test";
import { processPdfOcrWave, type PdfOcrWaveDependencies } from "../functions/_shared/pdf-ocr-wave.ts";
import { createPageIndexState, type PageIndexState } from "../functions/_shared/page-index-plan.ts";
import { legacyPdfOcrWave } from "./fixtures/pdf-ocr-wave-legacy.ts";

// IO doubles exercise the actual wave, including selected page windows, byte
// slicing, concurrency, provider errors and assembly. No live OCR or database.
function harness(pageCount: number, respond = async (start: number) => ({ text: `text-${start}`, debug: {} })) {
  const windows: number[][] = [];
  const calls: Array<{ start: number; fileName: string; signal: AbortSignal }> = [];
  let active = 0, maxActive = 0;
  const source = { getPageCount: () => pageCount };
  const dependencies: PdfOcrWaveDependencies<typeof source, number> = {
    pdf: {
      async load(_buf, options) { expect(options).toEqual({ ignoreEncryption: true }); return source; },
      async create() {
        let indices: number[] = [];
        return {
          async copyPages(input, pages) { expect(input).toBe(source); indices = pages; windows.push(pages); return pages; },
          addPage() {},
          async save(options) {
            expect(options).toEqual({ useObjectStreams: false });
            // A subarray exposes unwanted surrounding bytes unless sliced correctly.
            return new Uint8Array([255, indices[0] >> 8, indices[0] & 255, 255]).subarray(1, 3);
          },
        };
      },
    },
    async extract(params) {
      const bytes = new Uint8Array(params.buf);
      expect(bytes.length).toBe(2);
      expect(params.mimeType).toBe("application/pdf");
      const start = bytes[0] * 256 + bytes[1];
      calls.push({ start, fileName: params.fileName, signal: params.signal });
      active++; maxActive = Math.max(active, maxActive);
      try { return await respond(start); } finally { active--; }
    },
  };
  return { dependencies, windows, calls, maxActive: () => maxActive };
}

describe("shared bounded PDF OCR wave", () => {
  test("matches the frozen pre-refactor wave for success, partial, retry and exhaustion", async () => {
    for (const pageCount of [1, 18, 54, 601]) {
      for (const mode of ["success", "partial", "exhausted"]) {
        const responders = () => {
          let firstFailed = false;
          return async (start: number) => {
            if ((mode === "partial" && start === 0 && !firstFailed) || mode === "exhausted") {
              firstFailed = true;
              throw new Error("private exception");
            }
            return { text: `text-${start}`, debug: {} };
          };
        };
        const oldIo = harness(pageCount, responders()), newIo = harness(pageCount, responders());
        let oldState: unknown, newState: unknown;
        const stable = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => key === "updated_at" ? undefined : v));
        for (let wave = 0; wave < 36; wave++) {
          const oldResult = await legacyPdfOcrWave(new ArrayBuffer(0), "fixture", oldState, "legacy", oldIo.dependencies);
          const newResult = await processPdfOcrWave(new ArrayBuffer(0), "fixture", newState, "legacy", newIo.dependencies);
          expect(stable(newResult)).toEqual(stable(oldResult));
          expect(newIo.windows).toEqual(oldIo.windows);
          oldState = oldResult.pageIndex; newState = newResult.pageIndex;
          if (newResult.complete || newResult.needsManualReview) break;
        }
      }
    }
  });

  test("deadline rejects otherwise successful results and disposes its timer", async () => {
    const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
    let expire: () => void = () => { throw new Error("deadline not scheduled"); };
    let cleared = false;
    // No waiting 105 seconds: fire the actual processor deadline inside provider IO.
    globalThis.setTimeout = ((fn: () => void, delay: number) => {
      expect(delay).toBe(105_000); expire = fn; return 123;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => { expect(id).toBe(123); cleared = true; }) as typeof clearTimeout;
    try {
      const io = harness(6, async () => { expire(); return { text: "late text", debug: {} }; });
      const result = await processPdfOcrWave(new ArrayBuffer(0), "fixture", null, "", io.dependencies);
      expect(result.text).toBe("");
      expect(result.complete).toBe(false);
      expect(result.pageIndex.units[0]).toMatchObject({ status: "failed", attempts: 1 });
      expect(cleared).toBe(true);
    } finally {
      globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
    }
  });

  test("601 pages run across 34 invocations without lost, repeated or reordered windows", async () => {
    const io = harness(601);
    let checkpoint: PageIndexState | undefined;
    let text = "";
    for (let invocation = 0; invocation < 34; invocation++) {
      const before = io.calls.length;
      const result = await processPdfOcrWave(new ArrayBuffer(0), "fixture", checkpoint, text, io.dependencies);
      expect(io.calls.length - before).toBeLessThanOrEqual(3);
      expect(result.complete).toBe(invocation === 33);
      expect(result.needsManualReview).toBe(false);
      checkpoint = result.pageIndex;
      text = result.text;
    }
    expect(io.calls.map(c => c.start)).toEqual(Array.from({ length: 101 }, (_, i) => i * 6));
    expect(io.windows.at(-1)).toEqual([600]);
    expect(text).toBe(Array.from({ length: 101 }, (_, i) => `text-${i * 6}`).join("\n\n"));
    expect(checkpoint!.units.every(u => u.attempts === 1 && u.status === "completed")).toBe(true);
    expect(io.maxActive()).toBe(3);
    expect(io.calls.every(c => c.signal.aborted)).toBe(true); // timers/controllers disposed
  });

  test("out-of-order success survives a failed first unit and only that unit is retried", async () => {
    let fail = true;
    const io = harness(18, async start => {
      if (start === 0 && fail) throw new Error("PRIVATE_PROVIDER_BODY");
      if (start === 6) await new Promise(resolve => setTimeout(resolve, 5));
      return { text: ` text-${start} `, debug: {} };
    });
    const first = await processPdfOcrWave(new ArrayBuffer(0), "fixture", null, "legacy text", io.dependencies);
    expect(first.text).toBe("text-6\n\ntext-12");
    expect(first.complete).toBe(false);
    expect(first.pageIndex.units[0].error).toBe("pdf_ocr_chunk_failed_pages_1_6");
    expect(JSON.stringify(first)).not.toContain("PRIVATE_PROVIDER_BODY");
    fail = false;
    const next = await processPdfOcrWave(new ArrayBuffer(0), "fixture", first.pageIndex, first.text, io.dependencies);
    expect(io.calls.map(c => c.start)).toEqual([0, 6, 12, 0]);
    expect(io.calls[0].fileName).toBe("fixture.pages-1-6.pdf");
    expect(next.text).toBe("text-0\n\ntext-6\n\ntext-12");
    expect(next.pageIndex.units.map(u => u.attempts)).toEqual([2, 1, 1]);
    expect(next.complete).toBe(true);
  });

  test("empty, error and thrown results exhaust at three attempts without leaking provider content", async () => {
    const io = harness(18, async start => {
      if (start === 0) return { text: " ", debug: {} };
      if (start === 6) return { text: "ignored", debug: { error: "PRIVATE_PROVIDER_BODY" } };
      throw new Error("PRIVATE_PROVIDER_BODY");
    });
    let state: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await processPdfOcrWave(new ArrayBuffer(0), "fixture", state, " old text ", io.dependencies);
      expect(result.text).toBe("old text"); // legacy fallback retained
      expect(result.complete).toBe(false);
      expect(result.needsManualReview).toBe(attempt === 2);
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PROVIDER_BODY");
      state = result.pageIndex;
    }
    const terminal = await processPdfOcrWave(new ArrayBuffer(0), "fixture", state, "old text", io.dependencies);
    expect(io.calls).toHaveLength(9);
    expect(terminal.needsManualReview).toBe(true);
  });

  test("completed checkpoint causes no provider work and page-count mismatch rebuilds the plan", async () => {
    const io = harness(1);
    const result = await processPdfOcrWave(new ArrayBuffer(0), "fixture", null, "", io.dependencies);
    const resumed = await processPdfOcrWave(new ArrayBuffer(0), "fixture", result.pageIndex, result.text, io.dependencies);
    expect(resumed.complete).toBe(true);
    expect(io.calls).toHaveLength(1);
    const other = harness(7);
    const changed = await processPdfOcrWave(new ArrayBuffer(0), "fixture", result.pageIndex, result.text, other.dependencies);
    expect(other.windows).toEqual([[0, 1, 2, 3, 4, 5], [6]]);
    expect(changed.pageIndex.units.map(u => u.attempts)).toEqual([1, 1]);
  });

  test("PDF load failure does not call provider or mutate input checkpoint", async () => {
    const io = harness(6);
    io.dependencies.pdf.load = async () => { throw new Error("bad PDF"); };
    const state = createPageIndexState(6);
    const before = JSON.stringify(state);
    await expect(processPdfOcrWave(new ArrayBuffer(0), "fixture", state, "", io.dependencies)).rejects.toThrow("bad PDF");
    expect(io.calls).toHaveLength(0);
    expect(JSON.stringify(state)).toBe(before);
  });
});
