import {
  AI_FILL_EVALUATION_VERSION,
  AI_FILL_EVALUATION_TAXONOMY,
  CANONICAL_FIELD_EVALUATION_REGISTRY,
  FLAGSHIP_TEMPLATE_CODES_09A,
  TEMPLATE_BENCHMARK_PROFILES_09A,
  type AiFillEvaluationLabel,
  type CanonicalDocumentRole,
  type CanonicalFieldGroundTruth,
  type CanonicalFieldId,
  type FlagshipTemplateCode09A,
} from "./evaluation-baseline.ts";

export const Q0_BENCHMARK_VERSION = "09B-v1" as const;

export type Q0CaseStatus =
  | "recorded_output_pending"
  | "lawyer_review_pending"
  | "ready_for_evaluation";

export type ApprovedDocumentRef = {
  document_ref: string;
  sha256: string;
  provenance_ref: string;
  anonymized: true;
  approval_ref: string;
};

export type RecordedAiFillOutput = {
  output_ref: string;
  output_sha256: string;
  provenance_ref: string;
  captured_at: string;
  provider: string;
  model: string;
  model_version: string;
  prompt_version: string;
  fields: Readonly<Partial<Record<CanonicalFieldId, string | null>>>;
};

export type LawyerGroundTruth = {
  review_ref: string;
  review_sha256: string;
  reviewed_at: string;
  reviewer_id: string;
  reviewer_role: "lawyer";
  annotation_version: "09C-v1";
  fields: readonly CanonicalFieldGroundTruth[];
};

export type Q0BenchmarkCase = {
  case_id: string;
  case_version: "09B-v1";
  evaluation_version: typeof AI_FILL_EVALUATION_VERSION;
  template_code: FlagshipTemplateCode09A;
  template_revision: string;
  schema_revision: string;
  documents: readonly ApprovedDocumentRef[];
  expected_field_ids: readonly CanonicalFieldId[];
  recorded_output: RecordedAiFillOutput | null;
  lawyer_ground_truth: LawyerGroundTruth | null;
  status: Q0CaseStatus;
  synthetic_contract_only: boolean;
};

type Q0AdmissionInput = Pick<
  Q0BenchmarkCase,
  "template_code" | "expected_field_ids" | "recorded_output" | "lawyer_ground_truth"
>;

function isCanonicalFieldId(value: string): value is CanonicalFieldId {
  return Object.hasOwn(CANONICAL_FIELD_EVALUATION_REGISTRY, value);
}

function isEvaluationLabel(value: unknown): value is AiFillEvaluationLabel {
  return (
    typeof value === "string" && (AI_FILL_EVALUATION_TAXONOMY as readonly string[]).includes(value)
  );
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function requiredFieldIds(templateCode: FlagshipTemplateCode09A): readonly CanonicalFieldId[] {
  return TEMPLATE_BENCHMARK_PROFILES_09A[templateCode].fields
    .filter((rule) => rule.applicability === "required")
    .map((rule) => rule.field_id);
}

function validateEvidence(field: CanonicalFieldGroundTruth): readonly string[] {
  const errors: string[] = [];
  const definition = CANONICAL_FIELD_EVALUATION_REGISTRY[field.field_id];
  if (field.evidence.length === 0) errors.push("ground_truth_evidence_missing");
  for (const evidence of field.evidence) {
    if (
      !definition.accepted_document_roles.includes(evidence.document_role as CanonicalDocumentRole)
    ) {
      errors.push("ground_truth_evidence_role_invalid");
    }
    if (
      !evidence.document_ref.trim() ||
      !evidence.provenance_ref.trim() ||
      !evidence.quote.trim()
    ) {
      errors.push("ground_truth_evidence_provenance_missing");
    }
  }
  return errors;
}

/**
 * Admission is deliberately stricter than artifact presence. A completed
 * benchmark is evaluable only when the expected fields, recorded output and
 * independent lawyer annotations form an exact bijection.
 */
export function q0AdmissionErrors(input: Q0AdmissionInput): readonly string[] {
  const errors: string[] = [];
  const expectedIds = input.expected_field_ids as readonly string[];
  if (expectedIds.length === 0) errors.push("expected_fields_missing");
  const seenExpected = new Set<string>();
  for (const fieldId of expectedIds) {
    if (!isCanonicalFieldId(fieldId)) errors.push("unknown_expected_field_id");
    if (seenExpected.has(fieldId)) errors.push("duplicate_expected_field_id");
    seenExpected.add(fieldId);
  }
  for (const requiredId of requiredFieldIds(input.template_code)) {
    if (!seenExpected.has(requiredId)) errors.push("required_profile_field_missing");
  }

  if (input.recorded_output) {
    const recorded = input.recorded_output;
    if (!recorded.output_ref.trim() || !recorded.provenance_ref.trim()) {
      errors.push("recorded_output_provenance_missing");
    }
    if (!/^[a-f0-9]{64}$/i.test(recorded.output_sha256)) {
      errors.push("recorded_output_sha256_invalid");
    }
    if (!isIsoTimestamp(recorded.captured_at)) errors.push("recorded_output_captured_at_invalid");
    if (
      !recorded.provider.trim() ||
      !recorded.model.trim() ||
      !recorded.model_version.trim() ||
      !recorded.prompt_version.trim()
    ) {
      errors.push("recorded_output_model_metadata_missing");
    }
    const outputIds = Object.keys(input.recorded_output.fields);
    const seenOutput = new Set(outputIds);
    for (const fieldId of expectedIds) {
      if (!seenOutput.has(fieldId)) errors.push("recorded_output_field_missing");
    }
    for (const fieldId of outputIds) {
      if (!seenExpected.has(fieldId)) errors.push("recorded_output_field_unexpected");
      const value = input.recorded_output.fields[fieldId as CanonicalFieldId];
      if (value !== null && typeof value !== "string")
        errors.push("recorded_output_field_value_invalid");
    }
  }

  if (input.lawyer_ground_truth) {
    const review = input.lawyer_ground_truth;
    if (review.reviewer_role !== "lawyer") errors.push("ground_truth_reviewer_invalid");
    if (!review.review_ref.trim()) errors.push("ground_truth_review_ref_missing");
    if (!/^[a-f0-9]{64}$/i.test(review.review_sha256)) {
      errors.push("ground_truth_review_sha256_invalid");
    }
    if (!review.reviewer_id.trim()) errors.push("ground_truth_reviewer_id_missing");
    if (!isIsoTimestamp(review.reviewed_at)) errors.push("ground_truth_reviewed_at_invalid");
    if (review.annotation_version !== "09C-v1") {
      errors.push("ground_truth_annotation_version_invalid");
    }
    const seenAnnotations = new Set<string>();
    for (const field of input.lawyer_ground_truth.fields) {
      const fieldId = field.field_id as string;
      if (!isCanonicalFieldId(fieldId)) {
        errors.push("ground_truth_field_unknown");
        continue;
      }
      if (seenAnnotations.has(fieldId)) errors.push("ground_truth_field_duplicate");
      seenAnnotations.add(fieldId);
      if (!seenExpected.has(fieldId)) errors.push("ground_truth_field_unexpected");
      if (!isEvaluationLabel(field.label)) errors.push("ground_truth_label_invalid");
      if (field.expected_value !== null && typeof field.expected_value !== "string") {
        errors.push("ground_truth_expected_value_invalid");
      }
      if (field.expected_meaning !== CANONICAL_FIELD_EVALUATION_REGISTRY[fieldId].meaning) {
        errors.push("ground_truth_meaning_mismatch");
      }
      errors.push(...validateEvidence(field));
      if (
        field.label === "manual_preserved" &&
        (!field.manual_override.applied ||
          !field.manual_override.accepted_explicitly ||
          !field.manual_override.final_value_unchanged)
      ) {
        errors.push("ground_truth_manual_preserved_invalid");
      }
    }
    for (const fieldId of expectedIds) {
      if (!seenAnnotations.has(fieldId)) errors.push("ground_truth_field_missing");
    }
  }
  return errors;
}

export function deriveQ0Status(input: Q0AdmissionInput): Q0CaseStatus {
  if (!input.recorded_output) return "recorded_output_pending";
  if (!input.lawyer_ground_truth) return "lawyer_review_pending";
  return q0AdmissionErrors(input).length === 0 ? "ready_for_evaluation" : "lawyer_review_pending";
}

export function validateQ0BenchmarkCase(input: Q0BenchmarkCase): readonly string[] {
  const errors: string[] = [];
  if (!FLAGSHIP_TEMPLATE_CODES_09A.includes(input.template_code))
    errors.push("unsupported_template_code");
  if (input.case_version !== Q0_BENCHMARK_VERSION) errors.push("case_version_mismatch");
  if (input.evaluation_version !== AI_FILL_EVALUATION_VERSION)
    errors.push("evaluation_version_mismatch");
  if (!input.case_id.trim()) errors.push("case_id_missing");
  if (!input.template_revision.trim()) errors.push("template_revision_missing");
  if (!input.schema_revision.trim()) errors.push("schema_revision_missing");
  if (input.documents.length === 0) errors.push("approved_documents_missing");
  for (const doc of input.documents) {
    if (!doc.anonymized) errors.push("document_not_anonymized");
    if (!/^[a-f0-9]{64}$/i.test(doc.sha256)) errors.push("document_sha256_invalid");
    if (!doc.provenance_ref.trim()) errors.push("document_provenance_missing");
    if (!doc.approval_ref.trim()) errors.push("document_approval_missing");
  }
  errors.push(...q0AdmissionErrors(input));
  if (input.status !== deriveQ0Status(input)) errors.push("status_does_not_match_artifacts");
  return errors;
}

const PENDING_DOC: ApprovedDocumentRef = {
  document_ref: "fixture://approved-anonymized-document",
  sha256: "0".repeat(64),
  provenance_ref: "fixture:q0:document",
  anonymized: true,
  approval_ref: "fixture:q0:approval",
};

function pendingCase(templateCode: FlagshipTemplateCode09A): Q0BenchmarkCase {
  return {
    case_id: `q0-${templateCode}-001`,
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: templateCode,
    template_revision: "fixture-pending-real-template-revision",
    schema_revision: "fixture-pending-real-schema-revision",
    documents: [PENDING_DOC],
    expected_field_ids: requiredFieldIds(templateCode),
    recorded_output: null,
    lawyer_ground_truth: null,
    status: "recorded_output_pending",
    synthetic_contract_only: true,
  };
}

/**
 * Contract-only Q0 manifest. These five entries deliberately contain no model
 * output or lawyer ground truth and therefore make no accuracy/non-regression claim.
 * They are placeholders until approved anonymized real cases, recorded outputs and
 * lawyer-reviewed truth are supplied under separate authorization.
 */
export const Q0_BENCHMARK_MANIFEST_09B: readonly Q0BenchmarkCase[] =
  FLAGSHIP_TEMPLATE_CODES_09A.map(pendingCase);
