import { describe, expect, test } from "bun:test";
import { getPravoDocumentText } from "./official-sources.ts";

describe("Pravo DocumentText transport", () => {
  test("extracts text from documented text response", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain("/api/DocumentText?eonumber=0001201708190001");
      return new Response(JSON.stringify({ text: "Официальный текст документа" }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(getPravoDocumentText("0001201708190001")).resolves.toBe(
        "Официальный текст документа",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  test("returns null for an invalid eoNumber", async () => {
    await expect(getPravoDocumentText("bad")).resolves.toBeNull();
  });
});
