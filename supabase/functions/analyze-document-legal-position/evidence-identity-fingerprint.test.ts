import { describe, expect, test } from "bun:test";
import {
  buildEvidenceMatrix,
  buildFactRecords,
  computeEvidenceIdentity,
} from "./enrich.ts";

function matrixFor(opts: {
  documents: Array<{ id: string; title: string; ocr_length: number; evidence_identity?: string | null }>;
  relations: Array<{ doc_id: string; relation: string }>;
  claimType?: "documentary_observation" | "party_assertion" | "authority_finding" | "objective_proposition" | "relational_proposition";
}) {
  const factInput = [{ fact_key: "F1", text: "Факт подтверждён материалами дела", claim_type: opts.claimType ?? "objective_proposition" }];
  const { records, keyToId } = buildFactRecords(factInput);
  return buildEvidenceMatrix({
    facts: records,
    factKeyToId: keyToId,
    conclusions: [],
    documents: opts.documents,
    parsed: {
      fact_to_evidence_mapping: [{ fact_key: "F1", documents: opts.relations }],
      missing_evidence: [],
      weak_points: [],
    },
  })[0];
}

describe("Stage 03A evidence identity fingerprint", () => {
  test("normalization makes whitespace-equivalent extracted text share one deterministic identity", async () => {
    const a = await computeEvidenceIdentity("  Акт   проверки\n№ 17\tот 01.02.2026  ");
    const b = await computeEvidenceIdentity("Акт проверки № 17 от 01.02.2026");
    const c = await computeEvidenceIdentity("Акт проверки № 18 от 01.02.2026");

    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a?.startsWith("sha256:")).toBe(true);
  });

  test("two document ids with the same evidence identity do not inflate independent support", () => {
    const row = matrixFor({
      documents: [
        { id: "DOC_A_PDF", title: "Акт.pdf", ocr_length: 1000, evidence_identity: "sha256:same" },
        { id: "DOC_A_DOCX", title: "Акт.docx", ocr_length: 1000, evidence_identity: "sha256:same" },
      ],
      relations: [
        { doc_id: "DOC_A_PDF", relation: "SUPPORTS" },
        { doc_id: "DOC_A_DOCX", relation: "SUPPORTS" },
      ],
    });

    expect(row.documents_used).toEqual(["DOC_A_PDF", "DOC_A_DOCX"]);
    expect(row.document_relations).toHaveLength(2);
    expect(row.evidence_status).toBe("proven");
    expect(row.evidence_strength).toBe("medium");
  });

  test("two genuinely different evidence identities still count as independent support", () => {
    const row = matrixFor({
      documents: [
        { id: "DOC_A", title: "Акт", ocr_length: 1000, evidence_identity: "sha256:a" },
        { id: "DOC_B", title: "Письмо", ocr_length: 900, evidence_identity: "sha256:b" },
      ],
      relations: [
        { doc_id: "DOC_A", relation: "SUPPORTS" },
        { doc_id: "DOC_B", relation: "SUPPORTS" },
      ],
    });

    expect(row.evidence_status).toBe("proven");
    expect(row.evidence_strength).toBe("high");
  });

  test("mixed contradiction remains unresolved while all representations stay in provenance", () => {
    const row = matrixFor({
      documents: [
        { id: "DOC_A_PDF", title: "Акт.pdf", ocr_length: 1000, evidence_identity: "sha256:same" },
        { id: "DOC_A_DOCX", title: "Акт.docx", ocr_length: 1000, evidence_identity: "sha256:same" },
      ],
      relations: [
        { doc_id: "DOC_A_PDF", relation: "SUPPORTS" },
        { doc_id: "DOC_A_DOCX", relation: "CONTRADICTS" },
      ],
    });

    expect(row.documents_used).toEqual(["DOC_A_PDF", "DOC_A_DOCX"]);
    expect(row.evidence_status).toBe("partial");
    expect(row.evidence_strength).toBe("low");
    expect(row.contradiction_notes).toContain("противореч");
  });
});
