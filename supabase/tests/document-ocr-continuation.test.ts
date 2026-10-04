import { describe, expect, test } from "bun:test";
import {
  MAX_INLINE_DURABLE_OCR_INVOCATIONS,
  shouldContinueDurableOcr,
} from "../../src/lib/document-ocr-continuation.ts";

describe("document OCR continuation", () => {
  test("continues only while the durable extractor requests another bounded pass", () => {
    expect(shouldContinueDurableOcr({ continuation_required: true }, 1)).toBe(true);
    expect(shouldContinueDurableOcr({ continuation_required: false }, 1)).toBe(false);
    expect(shouldContinueDurableOcr({}, 1)).toBe(false);
  });

  test("does not exceed the durable OCR retry budget from one UI action", () => {
    expect(shouldContinueDurableOcr(
      { continuation_required: true },
      MAX_INLINE_DURABLE_OCR_INVOCATIONS,
    )).toBe(false);
  });
});
