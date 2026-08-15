import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplateMigrationFixture, extractInsertedTemplateCodes } from "./migration-state.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(testsDirectory, "../migrations_legacy");
const migrationFile = "20260806220000_t0b_template_registry_sync.sql";
const migrationPath = join(migrationsDirectory, migrationFile);

const productionOnlyCodes = [
  "corporate_50_50_agreement",
  "tax_54_1_defense_strategy",
  "tax_54_1_risk_opinion",
  "tax_additional_control_objections",
  "tax_arbitration_claim",
  "tax_audit_objections_extended",
  "tax_business_splitting_analysis",
  "tax_camera_audit_response",
  "tax_counterparty_due_diligence",
  "tax_court_position",
  "tax_decision_analysis",
  "tax_document_submission_registry",
  "tax_evidence_matrix",
  "tax_reconstruction_analysis",
  "tax_request_legality_analysis",
  "tax_strategy_memo",
  "tax_ufns_appeal",
  "tax_vat_explanations",
].sort();

const expectedDescriptions = new Map<string, string>([
  [
    "corporate_50_50_agreement",
    "Корпоративное соглашение между двумя участниками 50/50 с регулированием голосования, deadlock, продажи долей, выхода участников, передачи акций, защиты IP и разрешения споров.",
  ],
  [
    "tax_54_1_defense_strategy",
    "Стратегия защиты по спорам о необоснованной налоговой выгоде, реальности операций и деловой цели.",
  ],
  [
    "tax_54_1_risk_opinion",
    "Анализ реальности операций, деловой цели, контрагентов и налоговой выгоды.",
  ],
  [
    "tax_additional_control_objections",
    "Возражения по результатам дополнительных мероприятий налогового контроля.",
  ],
  ["tax_arbitration_claim", "Оспаривание решения ФНС в арбитражном суде."],
  ["tax_audit_objections_extended", "Развёрнутые возражения на акт налоговой проверки."],
  ["tax_business_splitting_analysis", "Оценка признаков дробления бизнеса."],
  ["tax_camera_audit_response", "Ответ на требование ФНС по камеральной налоговой проверке."],
  [
    "tax_counterparty_due_diligence",
    "Проверка контрагента: реальность деятельности, ресурсы, документы, деловая цель, налоговые риски.",
  ],
  ["tax_court_position", "Правовая позиция налогоплательщика для арбитражного суда."],
  [
    "tax_decision_analysis",
    "Анализ решения ФНС по результатам проверки: выводы, нарушения, сроки, основания для обжалования.",
  ],
  [
    "tax_document_submission_registry",
    "Реестр документов, передаваемых в налоговый орган по требованию.",
  ],
  [
    "tax_evidence_matrix",
    "Таблица доказательств: факт, документ, источник, риск, пробел, действие.",
  ],
  [
    "tax_reconstruction_analysis",
    "Анализ возможности налоговой реконструкции по спорам о необоснованной налоговой выгоде, ст. 54.1 НК РФ, реальности операций и определении действительных налоговых обязательств.",
  ],
  ["tax_request_legality_analysis", "Проверка законности требования ФНС."],
  ["tax_strategy_memo", "План защиты: риски, доказательства, сроки, документы."],
  ["tax_ufns_appeal", "Досудебная жалоба на решение налогового органа."],
  ["tax_vat_explanations", "Пояснения по НДС, расхождениям, вычетам и контрагентам."],
]);

describe("T0-B canonical template registry migration", () => {
  test("inserts exactly the 18 production-only codes without UUIDs", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(extractInsertedTemplateCodes(sql).sort()).toEqual(productionOnlyCodes);
    expect(sql).toContain("ON CONFLICT (code) DO NOTHING");
    expect(sql).not.toMatch(/\bid\s*,\s*code\b/i);
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b/i);
  });

  test("contains every exact production description", async () => {
    const sql = await Bun.file(migrationPath).text();
    for (const [code, description] of expectedDescriptions) {
      const row = sql.split("\n").find((line) => line.includes(`('${code}'`));
      expect(row, code).toBeDefined();
      expect(row, code).toContain(`'${description}'`);
    }
  });

  test("reproduces 197 unique templates and 194 active templates", async () => {
    const state = await buildTemplateMigrationFixture(migrationsDirectory, migrationFile);
    expect(state.size).toBe(197);
    expect([...state.values()].filter((entry) => entry.is_active)).toHaveLength(194);
    for (const code of productionOnlyCodes) expect(state.has(code), code).toBe(true);
  });

  test("preserves all prior codes and deprecates only the three exact duplicates", async () => {
    const stateBefore = await buildTemplateMigrationFixture(
      migrationsDirectory,
      "20260726130000_create_document_intake_canonical_consumer_observations.sql",
    );
    const stateAfter = await buildTemplateMigrationFixture(migrationsDirectory, migrationFile);
    expect(stateBefore.size).toBe(179);
    for (const code of stateBefore.keys()) expect(stateAfter.has(code), code).toBe(true);

    const inactive = [...stateAfter.values()]
      .filter((entry) => !entry.is_active)
      .map((entry) => entry.code)
      .sort();
    expect(inactive).toEqual(["tax_complaint", "tax_refund_application", "tax_strategy"]);
  });

  test("uses exact replacement metadata and non-destructive JSON merge", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(");
    expect(sql).toContain("WHEN 'tax_complaint' THEN 'tax_ufns_appeal'");
    expect(sql).toContain("WHEN 'tax_refund_application' THEN 'tax_offset_application'");
    expect(sql).toContain("WHEN 'tax_strategy' THEN 'tax_strategy_memo'");
    expect(sql).toContain(
      "'deprecated_reason', 'Duplicate tax template; kept for backward compatibility'",
    );
  });

  test("keeps T0-C flagship ordering out of scope", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("WHEN 'tax_due_diligence' THEN 80");
    expect(sql).toContain("WHEN 'response_to_tax_request' THEN 120");
    expect(sql).toContain("WHEN 'tax_explanations' THEN 130");
    expect(sql).not.toMatch(
      /WHEN\s+'(?:response_to_tax_request|tax_explanations|tax_vat_explanations|tax_strategy_memo|tax_court_position)'\s+THEN\s+[1-5]\b/,
    );
  });
});
