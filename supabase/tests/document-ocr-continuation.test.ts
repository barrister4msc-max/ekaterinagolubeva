import { describe, expect, test } from "bun:test";
import { shouldContinueDurableOcr } from "../../src/lib/document-ocr-continuation.ts";

describe("document OCR continuation", () => {
  test("continues until the durable extractor reports a terminal response", () => {
    const responses = Array.from({ length: 10 }, () => ({ continuation_required: true }))
      .concat({ continuation_required: false });
    let completedInvocations = 1;
    let extraction = responses[0];

    while (shouldContinueDurableOcr(extraction)) {
      extraction = responses[completedInvocations];
      completedInvocations += 1;
    }

    expect(completedInvocations).toBe(11);
    expect(shouldContinueDurableOcr({})).toBe(false);
  });
});
