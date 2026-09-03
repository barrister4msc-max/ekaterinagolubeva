export const AI_FILL_EVALUATION_VERSION = "09A-v1" as const;

export const AI_FILL_EVALUATION_TAXONOMY = [
  "correct",
  "incorrect",
  "unsupported",
  "unknown",
  "manual_preserved",
] as const;

export type AiFillEvaluationLabel = (typeof AI_FILL_EVALUATION_TAXONOMY)[number];

export const FLAGSHIP_TEMPLATE_CODES_09A = [
  "response_to_tax_request",
  "tax_explanations",
  "tax_vat_explanations",
  "tax_strategy_memo",
  "tax_court_position",
] as const;

export type FlagshipTemplateCode09A = (typeof FLAGSHIP_TEMPLATE_CODES_09A)[number];

export type CanonicalFieldId =
  | "company.name"
  | "company.inn"
  | "company.kpp"
  | "company.ogrn"
  | "company.legal_address"
  | "tax.authority_name"
  | "tax.request_number"
  | "tax.request_date"
  | "tax.period"
  | "tax.position_summary"
  | "tax.contested_amount"
  | "tax.vat_period"
  | "tax.court_case_number";

export type CanonicalDocumentRole =
  | "party_identity"
  | "authority_identity"
  | "procedural_request"
  | "tax_return"
  | "tax_audit_act"
  | "tax_decision"
  | "court_act"
  | "user_manual_input";

export type CanonicalFieldDefinition = {
  id: CanonicalFieldId;
  meaning: string;
  value_kind: "text" | "identifier" | "date" | "money" | "period";
  comparator: CanonicalFieldComparator;
  accepted_document_roles: readonly CanonicalDocumentRole[];
  preserve_negation: boolean;
  preserve_conflict: boolean;
  provenance_required: boolean;
  manual_override_supported: boolean;
};

/**
 * A comparator is part of the benchmark contract, not a model capability.
 * Narrative equivalence is deliberately supplied by a lawyer review and is
 * never inferred by the runtime AI-fill model.
 */
export type CanonicalFieldComparator =
  | "normalized_text"
  | "identifier_normalized"
  | "date_calendar"
  | "money_normalized"
  | "period_normalized"
  | "lawyer_semantic";

export const CANONICAL_FIELD_EVALUATION_REGISTRY: Readonly<
  Record<CanonicalFieldId, CanonicalFieldDefinition>
> = {
  "company.name": {
    id: "company.name",
    meaning:
      "Полное или краткое наименование организации, выступающей клиентом/налогоплательщиком по материалам дела.",
    value_kind: "text",
    comparator: "normalized_text",
    accepted_document_roles: [
      "party_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "company.inn": {
    id: "company.inn",
    meaning:
      "ИНН организации, относящийся именно к клиенту/налогоплательщику, а не к контрагенту или иному лицу.",
    value_kind: "identifier",
    comparator: "identifier_normalized",
    accepted_document_roles: [
      "party_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "company.kpp": {
    id: "company.kpp",
    meaning: "КПП организации, относящийся к клиенту/налогоплательщику.",
    value_kind: "identifier",
    comparator: "identifier_normalized",
    accepted_document_roles: [
      "party_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "company.ogrn": {
    id: "company.ogrn",
    meaning: "ОГРН организации, относящийся к клиенту/налогоплательщику.",
    value_kind: "identifier",
    comparator: "identifier_normalized",
    accepted_document_roles: [
      "party_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "company.legal_address": {
    id: "company.legal_address",
    meaning:
      "Юридический адрес организации на релевантную дату, если он подтверждён допустимым источником.",
    value_kind: "text",
    comparator: "normalized_text",
    accepted_document_roles: [
      "party_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.authority_name": {
    id: "tax.authority_name",
    meaning:
      "Наименование налогового органа, направившего требование/принявшего акт или решение по рассматриваемому эпизоду.",
    value_kind: "text",
    comparator: "normalized_text",
    accepted_document_roles: [
      "authority_identity",
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
    ],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.request_number": {
    id: "tax.request_number",
    meaning:
      "Номер конкретного требования налогового органа, на которое готовится ответ или пояснения.",
    value_kind: "identifier",
    comparator: "identifier_normalized",
    accepted_document_roles: ["procedural_request"],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.request_date": {
    id: "tax.request_date",
    meaning: "Дата конкретного требования налогового органа.",
    value_kind: "date",
    comparator: "date_calendar",
    accepted_document_roles: ["procedural_request"],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.period": {
    id: "tax.period",
    meaning:
      "Налоговый/отчётный период, к которому относится рассматриваемый вопрос или требование.",
    value_kind: "period",
    comparator: "period_normalized",
    accepted_document_roles: ["procedural_request", "tax_return", "tax_audit_act", "tax_decision"],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.position_summary": {
    id: "tax.position_summary",
    meaning:
      "Краткое фактическое содержание позиции клиента без добавления неподтверждённых фактов и с сохранением отрицаний/оговорок.",
    value_kind: "text",
    comparator: "lawyer_semantic",
    accepted_document_roles: [
      "procedural_request",
      "tax_audit_act",
      "tax_decision",
      "court_act",
      "user_manual_input",
    ],
    preserve_negation: true,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.contested_amount": {
    id: "tax.contested_amount",
    meaning:
      "Оспариваемая/доначисленная сумма, относящаяся к конкретному эпизоду; отсутствие начисления нельзя превращать в начисление.",
    value_kind: "money",
    comparator: "money_normalized",
    accepted_document_roles: ["tax_audit_act", "tax_decision", "court_act"],
    preserve_negation: true,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.vat_period": {
    id: "tax.vat_period",
    meaning: "Налоговый период по НДС, если поле применимо к конкретному шаблону/эпизоду.",
    value_kind: "period",
    comparator: "period_normalized",
    accepted_document_roles: ["procedural_request", "tax_return", "tax_audit_act", "tax_decision"],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
  "tax.court_case_number": {
    id: "tax.court_case_number",
    meaning:
      "Номер судебного дела, относящийся к позиции в суде; не должен подставляться из нерелевантного дела.",
    value_kind: "identifier",
    comparator: "identifier_normalized",
    accepted_document_roles: ["court_act"],
    preserve_negation: false,
    preserve_conflict: true,
    provenance_required: true,
    manual_override_supported: true,
  },
};

export type TemplateFieldBenchmarkRule = {
  field_id: CanonicalFieldId;
  applicability: "required" | "optional" | "not_applicable";
  weight: 1 | 2 | 3;
};

export type TemplateBenchmarkProfile = {
  profile_version: "09A-v1";
  template_code: FlagshipTemplateCode09A;
  fields: readonly TemplateFieldBenchmarkRule[];
};

const COMMON_COMPANY_FIELDS: readonly TemplateFieldBenchmarkRule[] = [
  { field_id: "company.name", applicability: "required", weight: 3 },
  { field_id: "company.inn", applicability: "required", weight: 3 },
  { field_id: "company.kpp", applicability: "optional", weight: 1 },
  { field_id: "company.ogrn", applicability: "optional", weight: 1 },
  { field_id: "company.legal_address", applicability: "optional", weight: 1 },
];

export const TEMPLATE_BENCHMARK_PROFILES_09A: Readonly<
  Record<FlagshipTemplateCode09A, TemplateBenchmarkProfile>
> = {
  response_to_tax_request: {
    profile_version: "09A-v1",
    template_code: "response_to_tax_request",
    fields: [
      ...COMMON_COMPANY_FIELDS,
      { field_id: "tax.authority_name", applicability: "required", weight: 3 },
      { field_id: "tax.request_number", applicability: "required", weight: 3 },
      { field_id: "tax.request_date", applicability: "required", weight: 2 },
      { field_id: "tax.period", applicability: "optional", weight: 2 },
      { field_id: "tax.position_summary", applicability: "required", weight: 3 },
    ],
  },
  tax_explanations: {
    profile_version: "09A-v1",
    template_code: "tax_explanations",
    fields: [
      ...COMMON_COMPANY_FIELDS,
      { field_id: "tax.authority_name", applicability: "required", weight: 3 },
      { field_id: "tax.request_number", applicability: "optional", weight: 2 },
      { field_id: "tax.request_date", applicability: "optional", weight: 1 },
      { field_id: "tax.period", applicability: "required", weight: 3 },
      { field_id: "tax.position_summary", applicability: "required", weight: 3 },
    ],
  },
  tax_vat_explanations: {
    profile_version: "09A-v1",
    template_code: "tax_vat_explanations",
    fields: [
      ...COMMON_COMPANY_FIELDS,
      { field_id: "tax.authority_name", applicability: "required", weight: 3 },
      { field_id: "tax.request_number", applicability: "optional", weight: 2 },
      { field_id: "tax.vat_period", applicability: "required", weight: 3 },
      { field_id: "tax.position_summary", applicability: "required", weight: 3 },
    ],
  },
  tax_strategy_memo: {
    profile_version: "09A-v1",
    template_code: "tax_strategy_memo",
    fields: [
      ...COMMON_COMPANY_FIELDS,
      { field_id: "tax.period", applicability: "optional", weight: 2 },
      { field_id: "tax.contested_amount", applicability: "optional", weight: 2 },
      { field_id: "tax.position_summary", applicability: "required", weight: 3 },
    ],
  },
  tax_court_position: {
    profile_version: "09A-v1",
    template_code: "tax_court_position",
    fields: [
      ...COMMON_COMPANY_FIELDS,
      { field_id: "tax.court_case_number", applicability: "required", weight: 3 },
      { field_id: "tax.period", applicability: "optional", weight: 2 },
      { field_id: "tax.contested_amount", applicability: "optional", weight: 2 },
      { field_id: "tax.position_summary", applicability: "required", weight: 3 },
    ],
  },
};

export type EvaluationEvidence = {
  document_role: CanonicalDocumentRole;
  document_ref: string;
  quote: string;
  provenance_ref: string;
};

export type CanonicalFieldGroundTruth = {
  field_id: CanonicalFieldId;
  /** Independent lawyer's field-level review outcome for the recorded output. */
  label: AiFillEvaluationLabel;
  expected_value: string | null;
  expected_meaning: string;
  evidence: readonly EvaluationEvidence[];
  negation_present: boolean;
  conflict_present: boolean;
  manual_override: {
    applied: boolean;
    accepted_explicitly: boolean;
    final_value_unchanged: boolean;
  };
};

export type CanonicalFieldObservation = {
  field_id: CanonicalFieldId;
  observed_value: string | null;
  supported_by: readonly EvaluationEvidence[];
  preserves_negation: boolean;
  preserves_conflict: boolean;
  manual_value_preserved: boolean;
  /** Required for narrative fields; set only by the independent legal reviewer. */
  semantic_equivalence: "equivalent" | "not_equivalent" | "not_reviewed";
};

function normalized(value: string | null): string | null {
  return value === null ? null : value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function normalizedIdentifier(value: string | null): string | null {
  return normalized(value)?.replace(/[\s\-–—]/g, "") ?? null;
}

function normalizedDate(value: string | null): string | null {
  const normalizedValue = normalized(value);
  if (!normalizedValue) return normalizedValue;
  const ruMatch = normalizedValue.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return isoMatch ? normalizedValue : normalizedValue;
}

function normalizedMoney(value: string | null): string | null {
  const normalizedValue = normalized(value);
  if (!normalizedValue) return normalizedValue;
  const compact = normalizedValue.replace(/\s/g, "").replace(",", ".");
  const numericMatch = compact.match(/^(-?\d+(?:\.\d+)?)(?:руб\.?|₽)?$/);
  if (!numericMatch) return normalizedValue;
  const numeric = Number(numericMatch[1]);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : normalizedValue;
}

function valuesMatch(
  comparator: CanonicalFieldComparator,
  observedValue: string | null,
  expectedValue: string | null,
  semanticEquivalence: CanonicalFieldObservation["semantic_equivalence"],
): boolean | null {
  switch (comparator) {
    case "identifier_normalized":
      return normalizedIdentifier(observedValue) === normalizedIdentifier(expectedValue);
    case "date_calendar":
      return normalizedDate(observedValue) === normalizedDate(expectedValue);
    case "money_normalized":
      return normalizedMoney(observedValue) === normalizedMoney(expectedValue);
    case "period_normalized":
    case "normalized_text":
      return normalized(observedValue) === normalized(expectedValue);
    case "lawyer_semantic":
      if (semanticEquivalence === "not_reviewed") return null;
      return semanticEquivalence === "equivalent";
  }
}

function evidenceSupports(
  observation: CanonicalFieldObservation,
  truth: CanonicalFieldGroundTruth,
): boolean {
  if (observation.supported_by.length === 0) return false;
  const expectedRefs = new Set(
    truth.evidence.map((item) => `${item.document_ref}|${item.provenance_ref}|${item.quote}`),
  );
  return observation.supported_by.some((item) =>
    expectedRefs.has(`${item.document_ref}|${item.provenance_ref}|${item.quote}`),
  );
}

/**
 * Universal 09A rubric. Template profiles never alter field meaning: they only
 * decide applicability/weight. Synthetic fixtures validate this contract only;
 * they are not evidence of model accuracy or production non-regression.
 */
export function evaluateCanonicalField(
  truth: CanonicalFieldGroundTruth,
  observation: CanonicalFieldObservation,
): AiFillEvaluationLabel {
  if (truth.field_id !== observation.field_id) throw new Error("field_id_mismatch");
  const definition = CANONICAL_FIELD_EVALUATION_REGISTRY[truth.field_id];
  if (!definition) throw new Error("unknown_canonical_field");

  if (
    truth.manual_override.applied &&
    truth.manual_override.accepted_explicitly &&
    truth.manual_override.final_value_unchanged &&
    observation.manual_value_preserved &&
    normalized(observation.observed_value) === normalized(truth.expected_value)
  ) {
    return "manual_preserved";
  }

  if (truth.expected_value === null) {
    return observation.observed_value === null ? "unknown" : "unsupported";
  }

  if (observation.observed_value === null) return "unknown";
  if (!evidenceSupports(observation, truth)) return "unsupported";
  if (definition.preserve_negation && truth.negation_present && !observation.preserves_negation)
    return "incorrect";
  if (definition.preserve_conflict && truth.conflict_present && !observation.preserves_conflict)
    return "incorrect";
  const matched = valuesMatch(
    definition.comparator,
    observation.observed_value,
    truth.expected_value,
    observation.semantic_equivalence,
  );
  return matched === null ? "unknown" : matched ? "correct" : "incorrect";
}

export function benchmarkRule(
  templateCode: FlagshipTemplateCode09A,
  fieldId: CanonicalFieldId,
): TemplateFieldBenchmarkRule | null {
  return (
    TEMPLATE_BENCHMARK_PROFILES_09A[templateCode].fields.find(
      (field) => field.field_id === fieldId,
    ) ?? null
  );
}
