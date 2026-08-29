import { describe, expect, it } from "bun:test";
import {
  buildEvidenceMatrix,
  buildFactRecords,
  type EvidenceRelation,
} from "./enrich.ts";

const FACT_TEXT = "Поставка товара состоялась";
const DOC_1 = "doc-1";
const DOC_2 = "doc-2";

function build(parsed: Record<string, unknown>) {
  const { records, keyToId } = buildFactRecords([
    { fact_key: "F1", text: FACT_TEXT, claim_type: "objective_proposition" },
  ]);

  const matrix = buildEvidenceMatrix({
    facts: records,
    parsed,
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

function canonical(relation?: unknown) {
  return build({
    fact_to_evidence_mapping: [
      {
        fact_key: "F1",
        documents: [
          relation === undefined ? { doc_id: DOC_1 } : { doc_id: DOC_1, relation },
        ],
      },
    ],
  });
}

describe("Stage 02 evidence relation fail-closed semantics", () => {
  it.each([
    ["SUPPORTS", "proven"],
    ["DIRECTLY_RECORDS", "proven"],
    ["PARTIALLY_SUPPORTS", "partial"],
    ["MERELY_STATES", "partial"],
    ["CONTRADICTS", "contradicted"],
  ] as Array<[EvidenceRelation, "proven" | "partial" | "contradicted"]>)(
    "preserves valid canonical relation %s",
    (relation, expectedStatus) => {
      const row = canonical(relation);
      expect(row.document_relations).toEqual([{ document_id: DOC_1, relation }]);
      expect(row.evidence_status).toBe(expectedStatus);
      expect(row.evidence_source).toBe("canonical");
    },
  );

  it("rejects an invalid canonical relation instead of promoting it to SUPPORTS", () => {
    const row = canonical("UNKNOWN_RELATION");

    expect(row.fact_text).toBe(FACT_TEXT);
    expect(row.documents_used).toEqual([]);
    expect(row.document_relations).toEqual([]);
    expect(row.evidence_status).not.toBe("proven");
    expect(row.evidence_source).toBe("none");
  });

  it("rejects a missing canonical relation instead of promoting it to SUPPORTS", () => {
    const row = canonical();

    expect(row.fact_text).toBe(FACT_TEXT);
    expect(row.documents_used).toEqual([]);
    expect(row.document_relations).toEqual([]);
    expect(row.evidence_status).not.toBe("proven");
    expect(row.evidence_source).toBe("none");
  });

  it("does not let malformed canonical output fall through to legacy fact_to_law mapping", () => {
    const row = build({
      fact_to_evidence_mapping: [
        {
          fact_key: "F1",
          documents: [{ doc_id: DOC_1, document_id: DOC_2, relation: "BROKEN" }],
        },
      ],
      fact_to_law_mapping: [{ fact_key: "F1", documents_used: [DOC_2] }],
    });

    expect(row.documents_used).toEqual([]);
    expect(row.document_relations).toEqual([]);
    expect(row.evidence_status).not.toBe("proven");
    expect(row.evidence_source).toBe("none");
  });

  it("preserves the explicit legacy fact_to_law adapter when canonical mapping is absent", () => {
    const row = build({
      fact_to_law_mapping: [{ fact_key: "F1", documents_used: [DOC_1] }],
    });

    expect(row.document_relations).toEqual([
      { document_id: DOC_1, relation: "SUPPORTS" },
    ]);
    expect(row.evidence_status).toBe("proven");
    expect(row.evidence_source).toBe("legacy_f2l");
  });

  it("preserves explicitly recognized legacy evidence object/string shapes", () => {
    const row = build({
      fact_to_evidence_mapping: [
        {
          fact_key: "F1",
          documents: [{ document_id: DOC_1 }, DOC_2],
        },
      ],
    });

    expect(row.document_relations).toEqual([
      { document_id: DOC_1, relation: "SUPPORTS" },
      { document_id: DOC_2, relation: "SUPPORTS" },
    ]);
    expect(row.evidence_status).toBe("proven");
    expect(row.evidence_source).toBe("canonical");
  });
});
