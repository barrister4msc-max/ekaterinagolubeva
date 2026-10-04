export const MAX_INLINE_DURABLE_OCR_INVOCATIONS = 3;

export type DocumentExtractionResponse = {
  continuation_required?: boolean;
};

/**
 * A durable PDF OCR job persists its checkpoint after each bounded invocation.
 * Keep driving that same job while it explicitly requests continuation, but
 * never exceed the server-side bounded retry budget in one UI action.
 */
export function shouldContinueDurableOcr(
  extraction: DocumentExtractionResponse | null | undefined,
  completedInvocations: number,
): boolean {
  return Boolean(extraction?.continuation_required) &&
    completedInvocations < MAX_INLINE_DURABLE_OCR_INVOCATIONS;
}
