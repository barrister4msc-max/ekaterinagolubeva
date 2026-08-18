import { describe, expect, test } from "bun:test";
import { extractExternalResearchReferences } from "../src/lib/external-legal-research-extractor";

describe("external legal research deterministic extractor", () => {
  test("extracts FNS letter requisites without treating narrative as source content", () => {
    const result = extractExternalResearchReferences(
      "В ответе упомянуто Письмо ФНС России от 10.03.2021 № БВ-4-7/3060@ и далее приведены выводы research-системы.",
    );
    const letter = result.references.find((item) => item.document_number === "БВ-4-7/3060@");
    expect(letter?.document_date).toBe("2021-03-10");
    expect(letter?.title).toContain("ФНС");
    expect(result.text).toContain("выводы research-системы");
  });

  test("extracts code article, court case and URL as separate discovery references", () => {
    const result = extractExternalResearchReferences(
      "См. ст. 54.1 НК РФ; дело А40-290584/2021; https://example.org/source?id=1.",
    );
    expect(result.references.some((item) => item.code === "НК РФ" && item.article === "54.1")).toBe(true);
    expect(result.references.some((item) => item.case_number === "А40-290584/2021")).toBe(true);
    expect(result.references.some((item) => item.url === "https://example.org/source?id=1")).toBe(true);
  });

  test("normalizes generic act number/date and deduplicates exact repeats", () => {
    const result = extractExternalResearchReferences(
      "Федеральный закон от 31.07.2020 № 266-ФЗ. Федеральный закон от 31.07.2020 № 266-ФЗ.",
    );
    const acts = result.references.filter((item) => item.document_number === "266-ФЗ");
    expect(acts).toHaveLength(1);
    expect(acts[0].document_date).toBe("2020-07-31");
  });

  test("does not invent references from ordinary legal narrative", () => {
    const result = extractExternalResearchReferences(
      "Система считает, что позиция налогоплательщика может быть усилена дополнительными доказательствами.",
    );
    expect(result.references).toHaveLength(0);
    expect(result.warnings).toContain("no_deterministic_references_found");
  });
});
