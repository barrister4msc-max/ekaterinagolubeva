import {
  AI_FILL_EVALUATION_VERSION,
  CANONICAL_FIELD_EVALUATION_REGISTRY,
  FLAGSHIP_TEMPLATE_CODES_09A,
  benchmarkRule,
  type CanonicalFieldGroundTruth,
  type CanonicalFieldId,
  type CanonicalDocumentRole,
  type FlagshipTemplateCode09A,
} from "./evaluation-baseline.ts";
import { Q0_BENCHMARK_VERSION } from "./q0-benchmark.ts";

/**
 * 09C-1 is an expert-authored synthetic truth foundation. It validates the
 * evaluation contract without a provider call, user document, or claim that a
 * lawyer reviewed an actual model proposal.
 */
export const Q0_EXPERT_SYNTHETIC_VERSION = "09C-1-v1" as const;

export type Q0ExpertSyntheticCase = {
  case_id: string;
  case_version: typeof Q0_BENCHMARK_VERSION;
  evaluation_version: typeof AI_FILL_EVALUATION_VERSION;
  template_code: FlagshipTemplateCode09A;
  classification: "expert_synthetic";
  lawyer_reviewed: false;
  eligible_for_model_accuracy_claim: false;
  fields: readonly CanonicalFieldGroundTruth[];
};

function evidence(
  role: CanonicalDocumentRole,
  documentRef: string,
  quote: string,
  provenanceRef: string,
) {
  return [{ document_role: role, document_ref: documentRef, quote, provenance_ref: provenanceRef }] as const;
}

function field(
  fieldId: CanonicalFieldId,
  expectedValue: string | null,
  items: readonly ReturnType<typeof evidence>,
  options: Partial<Pick<CanonicalFieldGroundTruth, "negation_present" | "conflict_present" | "manual_override">> = {},
): CanonicalFieldGroundTruth {
  return {
    field_id: fieldId,
    expected_value: expectedValue,
    expected_meaning: CANONICAL_FIELD_EVALUATION_REGISTRY[fieldId].meaning,
    evidence: items,
    negation_present: options.negation_present ?? false,
    conflict_present: options.conflict_present ?? false,
    manual_override: options.manual_override ?? {
      applied: false,
      accepted_explicitly: false,
      final_value_unchanged: false,
    },
  };
}

const CASES: readonly Q0ExpertSyntheticCase[] = [
  {
    case_id: "q0-response_to_tax_request-001",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "response_to_tax_request",
    classification: "expert_synthetic",
    lawyer_reviewed: false,
    eligible_for_model_accuracy_claim: false,
    fields: [
      field("company.name", "ООО «Север»", evidence("party_identity", "fixture://09c/response/request", "Заявитель: ООО «Север».", "fixture:09c:response:p1")),
      field("company.inn", "7700000000", evidence("party_identity", "fixture://09c/response/request", "ИНН 7700000000.", "fixture:09c:response:p1")),
      field("tax.authority_name", "ИФНС России № 1 по г. Москве", evidence("authority_identity", "fixture://09c/response/request", "Направитель: ИФНС России № 1 по г. Москве.", "fixture:09c:response:p1")),
      field("tax.request_date", "15.08.2026", evidence("procedural_request", "fixture://09c/response/request", "Дата требования: 15.08.2026.", "fixture:09c:response:p2")),
      field("tax.request_number", "12345", evidence("procedural_request", "fixture://09c/response/request", "Требование № 12345", "fixture:09c:response:p2")),
      field("tax.position_summary", "Запрошенные документы представлены в полном объёме.", evidence("procedural_request", "fixture://09c/response/request", "Документы представлены в полном объёме.", "fixture:09c:response:p3")),
    ],
  },
  {
    case_id: "q0-tax_explanations-001",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "tax_explanations",
    classification: "expert_synthetic",
    lawyer_reviewed: false,
    eligible_for_model_accuracy_claim: false,
    fields: [
      field("company.name", "ООО «Вектор»", evidence("party_identity", "fixture://09c/explanations/request", "ООО «Вектор»", "fixture:09c:explanations:p1")),
      field("company.inn", "7722222222", evidence("party_identity", "fixture://09c/explanations/request", "ИНН 7722222222.", "fixture:09c:explanations:p1")),
      field("tax.authority_name", "ИФНС России № 2 по г. Москве", evidence("authority_identity", "fixture://09c/explanations/request", "Налоговый орган: ИФНС России № 2 по г. Москве.", "fixture:09c:explanations:p1")),
      field("tax.period", "I квартал 2026 года", evidence("procedural_request", "fixture://09c/explanations/request", "за I квартал 2026 года", "fixture:09c:explanations:p2")),
      field("tax.position_summary", "Восстановление расходов по представленным документам не допускается.", evidence("tax_audit_act", "fixture://09c/explanations/act", "Восстановление расходов не допускается.", "fixture:09c:explanations:p5"), { negation_present: true }),
    ],
  },
  {
    case_id: "q0-tax_vat_explanations-001",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "tax_vat_explanations",
    classification: "expert_synthetic",
    lawyer_reviewed: false,
    eligible_for_model_accuracy_claim: false,
    fields: [
      field("company.name", "ООО «НДС‑Профиль»", evidence("party_identity", "fixture://09c/vat/request", "Налогоплательщик: ООО «НДС‑Профиль».", "fixture:09c:vat:p1")),
      field("company.inn", "7711111111", evidence("party_identity", "fixture://09c/vat/request", "ИНН 7711111111", "fixture:09c:vat:p1")),
      field("tax.authority_name", "ИФНС России № 3 по г. Москве", evidence("authority_identity", "fixture://09c/vat/request", "Налоговый орган: ИФНС России № 3 по г. Москве.", "fixture:09c:vat:p1")),
      field("tax.vat_period", "II квартал 2026 года", evidence("tax_return", "fixture://09c/vat/return", "НДС за II квартал 2026 года", "fixture:09c:vat:p2")),
      field("tax.position_summary", null, [], { conflict_present: true }),
    ],
  },
  {
    case_id: "q0-tax_strategy_memo-001",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "tax_strategy_memo",
    classification: "expert_synthetic",
    lawyer_reviewed: false,
    eligible_for_model_accuracy_claim: false,
    fields: [
      field("company.name", "ООО «Профиль»", evidence("party_identity", "fixture://09c/strategy/memo", "ООО «Профиль»", "fixture:09c:strategy:p1")),
      field("company.inn", "7733333333", evidence("party_identity", "fixture://09c/strategy/memo", "ИНН 7733333333.", "fixture:09c:strategy:p1")),
      field("tax.period", "2025 год", evidence("tax_return", "fixture://09c/strategy/return", "за 2025 год", "fixture:09c:strategy:p2")),
      field("tax.contested_amount", null, []),
      field("tax.position_summary", "Требуется выбрать правовой режим после проверки первичных документов; готовая стратегия не утверждена.", evidence("user_manual_input", "fixture://09c/strategy/manual", "Стратегия не утверждена без проверки первичных документов.", "fixture:09c:strategy:manual"), { conflict_present: true }),
    ],
  },
  {
    case_id: "q0-tax_court_position-001",
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: "tax_court_position",
    classification: "expert_synthetic",
    lawyer_reviewed: false,
    eligible_for_model_accuracy_claim: false,
    fields: [
      field("company.name", "ООО «Арбитр»", evidence("party_identity", "fixture://09c/court/claim", "ООО «Арбитр»", "fixture:09c:court:p1")),
      field("company.inn", "7744444444", evidence("party_identity", "fixture://09c/court/claim", "ИНН 7744444444.", "fixture:09c:court:p1")),
      field("tax.court_case_number", "А40-12345/2026", evidence("user_manual_input", "fixture://09c/court/manual", "А40-12345/2026", "fixture:09c:court:manual"), {
        manual_override: { applied: true, accepted_explicitly: true, final_value_unchanged: true },
      }),
      field("tax.position_summary", "Обстоятельства поставки подтверждаются представленными документами.", evidence("court_act", "fixture://09c/court/act", "Поставка подтверждается документами.", "fixture:09c:court:p4")),
    ],
  },
];

export const Q0_EXPERT_SYNTHETIC_TRUTH_09C: readonly Q0ExpertSyntheticCase[] = CASES;

export function validateQ0ExpertSyntheticCase(input: Q0ExpertSyntheticCase): readonly string[] {
  const errors: string[] = [];
  if (!input.case_id.trim()) errors.push("case_id_missing");
  if (input.case_version !== Q0_BENCHMARK_VERSION) errors.push("case_version_mismatch");
  if (input.evaluation_version !== AI_FILL_EVALUATION_VERSION) errors.push("evaluation_version_mismatch");
  if (!FLAGSHIP_TEMPLATE_CODES_09A.includes(input.template_code)) errors.push("unsupported_template_code");
  if (input.classification !== "expert_synthetic") errors.push("classification_invalid");
  if (input.lawyer_reviewed !== false) errors.push("expert_synthetic_cannot_claim_lawyer_review");
  if (input.eligible_for_model_accuracy_claim !== false) errors.push("expert_synthetic_cannot_claim_model_accuracy");
  if (input.fields.length === 0) errors.push("ground_truth_fields_missing");

  const seen = new Set<CanonicalFieldId>();
  for (const truth of input.fields) {
    const definition = CANONICAL_FIELD_EVALUATION_REGISTRY[truth.field_id];
    if (!definition) {
      errors.push("unknown_canonical_field");
      continue;
    }
    if (seen.has(truth.field_id)) errors.push("ground_truth_field_duplicated");
    seen.add(truth.field_id);
    if (!benchmarkRule(input.template_code, truth.field_id)) errors.push("field_not_applicable_to_template");
    if (truth.expected_meaning !== definition.meaning) errors.push("ground_truth_meaning_mismatch");
    if (truth.expected_value !== null && truth.evidence.length === 0) errors.push("ground_truth_evidence_missing");
    if (truth.expected_value === null && truth.evidence.length > 0) errors.push("unknown_field_has_evidence");
    for (const item of truth.evidence) {
      const manualEvidence = item.document_role === "user_manual_input" && truth.manual_override.applied;
      if (!manualEvidence && !definition.accepted_document_roles.includes(item.document_role)) {
        errors.push("ground_truth_evidence_role_invalid");
      }
      if (!item.document_ref.trim() || !item.provenance_ref.trim() || !item.quote.trim()) {
        errors.push("ground_truth_evidence_provenance_missing");
      }
    }
  }
  return errors;
}
