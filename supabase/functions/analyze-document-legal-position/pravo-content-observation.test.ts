import { describe, expect, test } from "bun:test";
import { toOfficialContentObservation } from "./pravo-content-observation.ts";

const context = {
  eoNumber: "0001201708190001",
  officialSourceId: "pravo:0001201708190001",
  officialUrl: "https://publication.pravo.gov.ru/document/0001201708190001",
  codeId: "NK_RF",
  article: "54.1",
  observedAt: "2026-08-22T00:00:00.000Z",
};

describe("Pravo content observation adapter", () => {
  test("accepts only an explicitly normalized official content envelope", () => {
    expect(
      toOfficialContentObservation(
        {
          article_text: "Статья 54.1. Пределы осуществления прав.",
          actuality_status: "verified",
        },
        context,
      ),
    ).toMatchObject({
      provider_id: "pravo",
      official_source_id: context.officialSourceId,
      code_id: "NK_RF",
      article: "54.1",
      content_source: "documented_official_content",
      actuality_status: "verified",
    });
  });

  test("does not guess article text from arbitrary PublicBlocks metadata", () => {
    expect(
      toOfficialContentObservation(
        {
          title: "Налоговый кодекс Российской Федерации",
          snippet: "Статья 54.1",
          actuality_status: "verified",
        },
        context,
      ),
    ).toBeNull();
  });

  test("rejects malformed identity and unknown actuality", () => {
    expect(
      toOfficialContentObservation(
        { article_text: "text", actuality_status: "unknown" },
        { ...context, eoNumber: "123" },
      ),
    ).toBeNull();
  });
});
