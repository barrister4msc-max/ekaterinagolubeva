import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeDocumentSetFingerprint,
  evaluateAutoAiFill,
} from "../../src/lib/auto-ai-fill";
import {
  applyFieldRedaction,
  applyManualFieldEdit,
  assertNoRedactionTokens,
  buildFieldRedactionMapping,
  findRedactionTokens,
  RedactionMappingError,
  restoreCanonicalAnswers,
} from "../../src/lib/redaction-field-mapping";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => Bun.file(join(here, p)).text();

const doc = (id: string, status: string | null, len: number) => ({
  id,
  extraction_status: status,
  ocr_text_length: len,
});

describe("auto AI-fill orchestration", () => {
  test("waits for every document to finish extraction", () => {
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents: [doc("a", "completed", 500), doc("b", "pending", 0)],
      lastFingerprint: null,
      inFlight: false,
      processing: false,
    });
    expect(decision.action).toBe("wait");
  });

  test("runs exactly once for a settled multi-document set", () => {
    const documents = [doc("a", "completed", 500), doc("b", "completed", 900)];
    const first = evaluateAutoAiFill({
      sessionId: "s1",
      documents,
      lastFingerprint: null,
      inFlight: false,
      processing: false,
    });
    expect(first.action).toBe("run");
    if (first.action !== "run") throw new Error("unreachable");
    expect(first.documentIds).toEqual(["a", "b"]);

    const second = evaluateAutoAiFill({
      sessionId: "s1",
      documents,
      lastFingerprint: first.fingerprint,
      inFlight: false,
      processing: false,
    });
    expect(second.action).toBe("skip");
    expect(second.reason).toBe("already_ran");
  });

  test("OCR-required documents are settled and do not keep auto-fill waiting", () => {
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents: [doc("a", "completed", 500), doc("b", "ocr_required", 0)],
      lastFingerprint: null,
      inFlight: false,
      processing: false,
    });
    expect(decision.action).toBe("run");
    if (decision.action !== "run") throw new Error("unreachable");
    expect(decision.documentIds).toEqual(["a"]);
  });

  test("partial page indexing cannot start AI-fill before all required units finish", () => {
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents: [doc("large-pdf", "partial_pages", 12_000)],
      lastFingerprint: null,
      inFlight: false,
      processing: false,
    });
    expect(decision.action).toBe("blocked");
    expect(decision.reason).toBe("no_extracted_text");
  });

  test("re-render / polling while a run is in flight never triggers a duplicate", () => {
    const documents = [doc("a", "completed", 500)];
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents,
      lastFingerprint: null,
      inFlight: true,
      processing: false,
    });
    expect(decision.action).toBe("skip");
  });

  test("adding a document after the first run starts a new run", () => {
    const before = [doc("a", "completed", 500)];
    const fp = computeDocumentSetFingerprint(before);
    const after = [...before, doc("b", "completed", 100)];
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents: after,
      lastFingerprint: fp,
      inFlight: false,
      processing: false,
    });
    expect(decision.action).toBe("run");
  });

  test("partial OCR failure runs on usable documents with an explicit partial reason", () => {
    const decision = evaluateAutoAiFill({
      sessionId: "s1",
      documents: [doc("a", "completed", 500), doc("b", "failed", 0)],
      lastFingerprint: null,
      inFlight: false,
      processing: false,
    });
    expect(decision.action).toBe("run");
    expect(decision.reason).toBe("partial_extraction");
    if (decision.action !== "run") throw new Error("unreachable");
    expect(decision.documentIds).toEqual(["a"]);
  });
});

describe("redaction field mapping", () => {
  const answers = {
    taxpayer_name: "ООО «Ромашка»",
    person_name: "Иванов Иван Иванович",
    taxpayer_inn: "7701234567",
    tax_amount: "1 500 000",
    defense_position: "Реконструкция возможна",
  };

  test("display values are tokens while canonical values survive", () => {
    const mapping = buildFieldRedactionMapping({ sessionId: "s1", answers });
    const display = applyFieldRedaction(answers, mapping);

    expect(display.taxpayer_name).toMatch(/^\[COMPANY_\d+\]$/);
    expect(display.person_name).toMatch(/^\[PERSON_\d+\]$/);
    expect(display.taxpayer_inn).toMatch(/^\[INN_\d+\]$/);
    // Legal position and amounts stay readable.
    expect(display.tax_amount).toBe("1 500 000");
    expect(display.defense_position).toBe("Реконструкция возможна");

    const canonical = restoreCanonicalAnswers(display, mapping);
    expect(canonical).toEqual(answers);
    expect(findRedactionTokens(canonical)).toEqual([]);
  });

  test("the same token always means the same field and value", () => {
    const mapping = buildFieldRedactionMapping({ sessionId: "s1", answers });
    const again = buildFieldRedactionMapping({ sessionId: "s1", answers, previous: mapping });
    expect(again.fields.person_name.token).toBe(mapping.fields.person_name.token);
  });

  test("missing mapping blocks final generation", () => {
    const mapping = buildFieldRedactionMapping({ sessionId: "s1", answers });
    const display = applyFieldRedaction(answers, mapping);
    expect(() => restoreCanonicalAnswers(display, null)).toThrow(RedactionMappingError);
  });

  test("corrupt mapping blocks final generation", () => {
    const mapping = buildFieldRedactionMapping({ sessionId: "s1", answers });
    const display = applyFieldRedaction(answers, mapping);
    const corrupt = { ...mapping, tokens: {} };
    expect(() => restoreCanonicalAnswers(display, corrupt)).toThrow(RedactionMappingError);
  });

  test("manual edit after redaction reaches the final document", () => {
    let mapping = buildFieldRedactionMapping({ sessionId: "s1", answers });
    const display = applyFieldRedaction(answers, mapping);
    mapping = applyManualFieldEdit(mapping, "person_name", "Петров Пётр Петрович");
    const edited = { ...display, person_name: mapping.fields.person_name.token };
    const canonical = restoreCanonicalAnswers(edited, mapping);
    expect(canonical.person_name).toBe("Петров Пётр Петрович");
  });

  test("no token may ever reach the generator", () => {
    expect(() => assertNoRedactionTokens("анкета", { a: "[PERSON_1]" })).toThrow(
      RedactionMappingError,
    );
    expect(() => assertNoRedactionTokens("анкета", { a: "Иванов" })).not.toThrow();
  });
});

describe("explicit AI-fill run identity", () => {
  test("edge function creates one run row and returns its id", async () => {
    const source = await read("../functions/document-intake-ai-fill/index.ts");
    expect(source).toContain('run_type: "intake_ai_fill"');
    expect(source).toContain("const aiFillRunId: string = runRow.id");
    expect(source).toContain("run_id: aiFillRunId");
    expect(source).toContain("intake_ai_fill: {");
  });

  test("generation consumes the explicit run id and fails closed on tokens", async () => {
    const source = await read("../../src/lib/generate-legal-document.ts");
    expect(source).toContain("intakeAiFillRunId");
    expect(source).toContain("intake_ai_fill_run_id: opts.intakeAiFillRunId ?? null");
    expect(source).toContain('assertNoRedactionTokens("анкета", payload.intake)');
    expect(source).toContain("restoreCanonicalAnswers(opts.state.answers, opts.redactionMapping)");
    expect(source).not.toContain("fetchLatestIntakeAiFill");
  });

  test("intake form auto-runs the same pipeline and keeps the manual fallback", async () => {
    const source = await read("../../src/components/document-builder/intake-form.tsx");
    expect(source).toContain("evaluateAutoAiFill");
    expect(source).toContain('handleAiFillFromDocument({ trigger: "auto", silent: true })');
    expect(source).toContain('handleAiFillFromDocument({ trigger: "manual" })');
    expect(source).toContain("Повторить AI-заполнение");
    expect(source).toContain("aiFillInFlightRef");
  });
});
