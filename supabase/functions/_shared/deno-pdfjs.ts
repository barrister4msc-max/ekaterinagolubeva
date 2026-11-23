export async function loadDenoPdfJs() {
  // @ts-ignore esm.sh's bundled Deno modules do not expose declarations.
  const pdfjs = await import("https://esm.sh/pdfjs-dist@4.10.38/deno/legacy/build/pdf.bundle.mjs");
  // @ts-ignore Load the worker explicitly so PDF.js can run it in-process on Edge.
  const worker = await import("https://esm.sh/pdfjs-dist@4.10.38/deno/legacy/build/pdf.worker.bundle.mjs");
  if (typeof worker.WorkerMessageHandler?.initializeFromPort !== "function") {
    throw new Error("invalid_pdf_worker_export");
  }
  Object.defineProperty(globalThis, "pdfjsWorker", { value: worker, configurable: true });
  return pdfjs;
}
