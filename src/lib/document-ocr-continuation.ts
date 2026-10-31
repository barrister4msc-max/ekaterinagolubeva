export type DocumentExtractionResponse = {
  continuation_required?: boolean;
};

/**
 * A durable PDF OCR job persists its checkpoint after each bounded invocation.
 * Keep driving that same job while it explicitly requests continuation. The
 * server owns the bounded per-unit retry budget and returns a terminal state.
 */
export function shouldContinueDurableOcr(
  extraction: DocumentExtractionResponse | null | undefined,
): boolean {
  return extraction?.continuation_required === true;
}
