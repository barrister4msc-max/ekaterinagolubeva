/** Existing PDF.js parser/quality gates; loader is supplied by the Edge entrypoint. */
export function createPdfTextLayerExtractor(load: () => Promise<any>) {
  return async function extractPdfTextLayer(buf: ArrayBuffer, timeoutMs = 30_000): Promise<string> {
    let loadingTask: any = null;
    let timeoutId: number | null = null;
    try {
      const pdfjs = await load();
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buf),
        disableWorker: true,
        useSystemFonts: false,
      });
      const extraction = (async () => {
        const pdf = await loadingTask.promise;
        const pages: string[] = new Array(pdf.numPages).fill("");
        const batchSize = 8;
        for (let start = 1; start <= pdf.numPages; start += batchSize) {
          const pageNumbers = Array.from(
            { length: Math.min(batchSize, pdf.numPages - start + 1) },
            (_, offset) => start + offset,
          );
          await Promise.all(
            pageNumbers.map(async (pageNumber) => {
              const page = await pdf.getPage(pageNumber);
              const content = await page.getTextContent();
              pages[pageNumber - 1] = (content.items ?? [])
                .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
                .filter(Boolean)
                .join(" ");
              page.cleanup?.();
            }),
          );
        }
        return pages
          .join("\\n\\n")
          .replace(/[ \\t]+\\n/g, "\\n")
          .replace(/\\n{3,}/g, "\\n\\n")
          .trim();
      })();

      const deadline = new Promise<string>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("pdf_text_extraction_timeout")),
          timeoutMs,
        ) as unknown as number;
      });
      return await Promise.race([extraction, deadline]);
    } catch (error) {
      console.error("[extract-document-text] PDF text-layer extraction failed", {
        error_code: "pdf_text_extraction_failed",
      });
      throw error;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      try {
        await loadingTask?.destroy?.();
      } catch (error) {
        console.warn("[extract-document-text] PDF.js destroy failed", {
          error_code: "pdf_destroy_failed",
        });
      }
    }
  };
}
export function sanitizeExtractedText(value: string): string {
  // PostgreSQL text/JSON cannot store NUL. Minimal PDF probes can surface
  // binary control bytes from compressed streams, so strip those before an
  // update and before deciding whether the text layer is usable.
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isUsablePdfTextLayer(value: string): boolean {
  if (value.length < 50) return false;
  const readable = value.match(/[A-Za-zА-Яа-яЁё0-9\s.,:;!?()'"№%+–—/\-]/g)?.length ?? 0;
  const words = value.match(/[A-Za-zА-Яа-яЁё]{2,}/g)?.length ?? 0;
  return readable / value.length >= 0.82 && words >= 10;
}
