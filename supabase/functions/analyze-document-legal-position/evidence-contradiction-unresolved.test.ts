import { describe, expect, it } from "bun:test";
import { buildEvidenceMatrix, buildFactRecords } from "./enrich.ts";

const DOC_1 = "doc-1";
const DOC_2 = "doc-2";

function build(
  documents: Array<{ doc_id: string; relation: string }>,
  claim_type: "objective_proposition" | "party_assertion" = "objective_proposition",
) {
  const { records, keyToId } = buildFactRecords([
    { fact_key: "F1", text: "Поставка товара состоялась", claim_type },
  ]);

  const matrix = buildEvidenceMatrix({
    facts: records,
    parsed: {
      fact_to_evidence_mapping: [{ fact_key: "F1", documents }],
    },
    conclusions: [],
    documents: [
      { id: DOC_1, title: "Документ 1", ocr_length: 100 },
      { id: DOC_2, title: "Документ 2", ocr_length: 100 },
    ],
    factKeyToId: keyToId,
  });

  expect(matrix).toHaveLength(1);
  return matrix[0]!;
}

describe("Stage 03 unresolved evidence contradictions", () => {
  it("does not mark SUPPORTS + CONTRADICTS from different documents as proven", () => {
    const row = build([
      { doc_id: DOC_1, relation: "SUPPORTS" },
      { doc_id: DOC_2, relation: "CONTRADICTS" },
    ]);

    expect(row.document_relations).toEqual([
      { document_id: DOC_1, relation: "SUPPORTS" },
      { document_id: DOC_2, relation: "CONTRADICTS" },
    ]);
    expect(row.evidence_status).toBe("partial");
    expect(row.evidence_strength).toBe("low");
    expect(row.contradiction_notes).toContain("требуется мотивированное разрешение");
  });

  it("does not mark DIRECTLY_RECORDS + CONTRADICTS as proven", () => {
    const row = build([
      { doc_id: DOC_1, relation: "DIRECTLY_RECORDS" },
      { doc_id: DOC_2, relation: "CONTRADICTS" },
    ]);

    expect(row.evidence_status).toBe("partial");
    expect(row.contradiction_notes).not.toBeNull();
  });

  it("preserves both conflicting relations when the same document id is repeated", () => {
    const row = build([
      { doc_id: DOC_1, relation: "SUPPORTS" },
      { doc_id: DOC_1, relation: "CONTRADICTS" },
    ]);

    expect(row.document_relations).toEqual([
      { document_id: DOC_1, relation: "SUPPORTS" },
      { document_id: DOC_1, relation: "CONTRADICTS" },
    ]);
    expect(row.documents_used).toEqual([DOC_1]);
    expect(row.evidence_status).toBe("partial");
  });

  it("keeps a clean SUPPORTS relation proven", () => {
    const row = build([{ doc_id: DOC_1, relation: "SUPPORTS" }]);
    expect(row.evidence_status).toBe("proven");
    expect(row.contradiction_notes).toBeNull();
  });

  it("keeps a pure CONTRADICTS relation contradicted", () => {
    const row = build([{ doc_id: DOC_1, relation: "CONTRADICTS" }]);
    expect(row.evidence_status).toBe("contradicted");
  });

  it("does not treat a party assertion merely stated in a document as proven", () => {
    const row = build([{ doc_id: DOC_1, relation: "MERELY_STATES" }], "party_assertion");
    expect(row.evidence_status).toBe("partial");
  });

  it("does not inflate support when the exact same document id is repeated", () => {
    const row = build([
      { doc_id: DOC_1, relation: "SUPPORTS" },
      { doc_id: DOC_1, relation: "SUPPORTS" },
    ]);

    expect(row.documents_used).toEqual([DOC_1]);
    expect(row.document_relations).toEqual([{ document_id: DOC_1, relation: "SUPPORTS" }]);
    expect(row.evidence_status).toBe("proven");
    expect(row.evidence_strength).toBe("medium");
  });
});
