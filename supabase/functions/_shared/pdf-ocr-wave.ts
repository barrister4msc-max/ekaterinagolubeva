/** One bounded PDF OCR wave. Caller owns authorization, lease and persistence.
 * No claims, scheduling or self-invocation; optional injected attempt hooks
 * persist each unit under the caller-owned lease.
 */
import {
  applyUnitResult,
  computePageIndexProgress,
  hasExhaustedPageUnit,
  resumePageIndexState,
  selectUnitsForInvocation,
  UNIT_CONCURRENCY,
  type PageIndexState,
} from "./page-index-plan.ts";

/** Minimal PDF SDK boundary; production supplies the existing pinned pdf-lib. */
export interface OcrPdfSource {
  getPageCount(): number;
}
export interface OcrPdfPart<Source, Page> {
  copyPages(source: Source, indices: number[]): Promise<Page[]>;
  addPage(page: Page): unknown;
  save(options: { useObjectStreams: boolean }): Promise<Uint8Array>;
}
export type PdfOcrWaveDependencies<Source extends OcrPdfSource, Page> = {
  pdf: {
    load(buffer: ArrayBuffer, options: { ignoreEncryption: boolean }): Promise<Source>;
    create(): Promise<OcrPdfPart<Source, Page>>;
  };
  extract: (params: {
    buf: ArrayBuffer;
    mimeType: string;
    fileName: string;
    signal: AbortSignal;
  }) => Promise<{ text: string; debug: Record<string, unknown> }>;
  /** Optional durable protocol. Caller must finish from authoritative DB state. */
  attempts?: {
    reserve(unit: { start: number; end: number; pageCount: number }): Promise<string>;
    settle(start: number, reservation: string, result: { text: string } | { error: string }): Promise<void>;
  };
};

export async function processPdfOcrWave<Source extends OcrPdfSource, Page>(
  buf: ArrayBuffer,
  fileName: string,
  cachedPageIndex: unknown,
  existingText: string,
  dependencies: PdfOcrWaveDependencies<Source, Page>,
): Promise<{ text: string; pageIndex: PageIndexState; complete: boolean; needsManualReview: boolean }> {
  const controller = new AbortController();
  const deadlineId = setTimeout(() => controller.abort(), 105_000);
  try {
    const source = await dependencies.pdf.load(buf, { ignoreEncryption: true });
    const pageIndex = resumePageIndexState(source.getPageCount(), cachedPageIndex);
    const selectedUnits = selectUnitsForInvocation(pageIndex);
    const chunks: Array<{ start: number; end: number; buf: ArrayBuffer }> = [];

    // Build only this invocation's page windows. A 600-page PDF is resumed
    // across bounded calls instead of creating 100 chunks and OCRing them in
    // one request.
    for (const unit of selectedUnits) {
      const part = await dependencies.pdf.create();
      const pages = await part.copyPages(
        source,
        Array.from({ length: unit.end - unit.start }, (_, offset) => unit.start + offset),
      );
      pages.forEach((page) => part.addPage(page));
      const bytes = await part.save({ useObjectStreams: false });
      chunks.push({
        start: unit.start,
        end: unit.end,
        buf: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      });
    }

    const results = new Map<number, { text: string } | { error: string }>();
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const index = cursor++;
        if (index >= chunks.length) return;
        const chunk = chunks[index];
        let reservation: string | null = null;
        try {
          reservation = dependencies.attempts
            ? await dependencies.attempts.reserve({ start: chunk.start, end: chunk.end, pageCount: pageIndex.page_count })
            : null;
          if (dependencies.attempts && controller.signal.aborted)
            throw new Error("ocr_wave_deadline");
          const result = await dependencies.extract({
            buf: chunk.buf,
            mimeType: "application/pdf",
            fileName: `${fileName}.pages-${chunk.start + 1}-${chunk.end}.pdf`,
            signal: controller.signal,
          });
          const unitResult = controller.signal.aborted || result.debug?.error || !result.text.trim()
            ? { error: `pdf_ocr_chunk_failed_pages_${chunk.start + 1}_${chunk.end}` }
            : { text: result.text.trim() };
          if (dependencies.attempts && reservation)
            await dependencies.attempts.settle(chunk.start, reservation, unitResult);
          results.set(chunk.start, unitResult);
        } catch (error) {
          if (dependencies.attempts && reservation) {
            try {
              await dependencies.attempts.settle(chunk.start, reservation, { error: "ocr_unit_failed" });
            } catch { /* Durable unresolved reservation still consumes the attempt. */ }
          }
          results.set(chunk.start, {
            error: `pdf_ocr_chunk_failed_pages_${chunk.start + 1}_${chunk.end}`,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(UNIT_CONCURRENCY, chunks.length) }, () => worker()));
    let nextState = pageIndex;
    for (const unit of selectedUnits) {
      nextState = applyUnitResult(nextState, unit.start, results.get(unit.start) ?? { error: "unit_not_processed" });
    }

    // Each completed unit retains its own text so out-of-order successes are
    // not lost when an earlier unit fails. The existing text is a migration
    // fallback for rows created before page_index was introduced.
    const cachedUnitText = nextState.units
      .filter((unit) => unit.status === "completed" && typeof unit.text === "string")
      .sort((a, b) => a.start - b.start)
      .map((unit) => unit.text as string)
      .join("\n\n");
    const text = cachedUnitText || existingText.trim();

    return {
      text,
      pageIndex: nextState,
      complete: computePageIndexProgress(nextState).complete,
      needsManualReview: hasExhaustedPageUnit(nextState),
    };
  } finally {
    clearTimeout(deadlineId);
    controller.abort();
  }
}
