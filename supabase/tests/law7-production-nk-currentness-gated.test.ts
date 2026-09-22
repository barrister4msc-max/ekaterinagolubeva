import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  ".github/workflows/law7-production-nk-currentness-gated.yml",
  "utf8",
);
const decision = readFileSync(
  "docs/legal-sources/praxis-and-nk-currentness-decision-2026-09-09.md",
  "utf8",
);

describe("Law7 Production NK currentness-gated import", () => {
  test("keeps the existing importer as the only mirror writer", () => {
    expect(workflow).toContain("scripts/law7_mirror_import.py --input");
    expect(workflow).toContain("--apply");
    expect(workflow).not.toMatch(/insert\s+into\s+law7_mirror/i);
    expect(workflow).not.toMatch(/update\s+law7_mirror/i);
    expect(workflow).not.toMatch(/delete\s+from\s+law7_mirror/i);
  });

  test("is manual, protected and explicitly scoped to both NK parts", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("LAW7_PRODUCTION_MIRROR_DATABASE_URL");
    expect(workflow).toContain("IMPORT_NK_RF_AND_NK_RF_2");
    expect(workflow).toContain("--codes NK_RF NK_RF_2");
  });

  test("fails closed on reviewed hash, actuality and official identity", () => {
    expect(workflow).toContain("expected_payload_sha256");
    expect(workflow).toContain("verified_as_of");
    expect(workflow).toContain("verification_reference");
    expect(workflow).toContain("1998-07-31");
    expect(workflow).toContain("2000-08-05");
    expect(workflow).toContain("publication.pravo.gov.ru");
    expect(workflow).toContain("multiple current versions");
    expect(workflow).toContain("text hash mismatch");
  });

  test("post-import audit is read-only and does not grant substantive use", () => {
    expect(workflow).toContain('conn.execute("set transaction read only")');
    expect(workflow).toContain('"substantive_use_granted": False');
  });

  test("does not admit Praxis corpus as a substantive source", () => {
    expect(decision).toContain(
      "Praxis is not admitted as a substantive legal-source provider",
    );
    expect(decision).toContain("Wikisource transcription");
    expect(decision).toContain("cross-encoder reranking");
    expect(decision).toContain("NLI/citation-entailment");
  });
});
