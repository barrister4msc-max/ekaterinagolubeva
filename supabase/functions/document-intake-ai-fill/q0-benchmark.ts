import {
  AI_FILL_EVALUATION_VERSION,
  CANONICAL_FIELD_EVALUATION_REGISTRY,
  FLAGSHIP_TEMPLATE_CODES_09A,
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
  reviewed_at: string;
  reviewer_role: "lawyer";
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

export function deriveQ0Status(
  recordedOutput: RecordedAiFillOutput | null,
  lawyerGroundTruth: LawyerGroundTruth | null,
): Q0CaseStatus {
  if (!recordedOutput) return "recorded_output_pending";
  if (!lawyerGroundTruth) return "lawyer_review_pending";
  return "ready_for_evaluation";
}

export function validateQ0BenchmarkCase(input: Q0BenchmarkCase): readonly string[] {
  const errors: string[] = [];
  if (!FLAGSHIP_TEMPLATE_CODES_09A.includes(input.template_code)) errors.push("unsupported_template_code");
  if (input.case_version !== Q0_BENCHMARK_VERSION) errors.push("case_version_mismatch");
  if (input.evaluation_version !== AI_FILL_EVALUATION_VERSION) errors.push("evaluation_version_mismatch");
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
  for (const fieldId of input.expected_field_ids) {
    if (!CANONICAL_FIELD_EVALUATION_REGISTRY[fieldId]) errors.push("unknown_canonical_field");
  }
  if (input.status !== deriveQ0Status(input.recorded_output, input.lawyer_ground_truth)) {
    errors.push("status_does_not_match_artifacts");
  }
  if (input.recorded_output) {
    const r = input.recorded_output;
    if (!r.output_ref.trim() || !r.provenance_ref.trim()) errors.push("recorded_output_provenance_missing");
    if (!/^[a-f0-9]{64}$/i.test(r.output_sha256)) errors.push("recorded_output_sha256_invalid");
    if (!r.provider.trim() || !r.model.trim() || !r.model_version.trim() || !r.prompt_version.trim()) {
      errors.push("recorded_output_model_metadata_missing");
    }
  }
  if (input.lawyer_ground_truth) {
    if (input.lawyer_ground_truth.reviewer_role !== "lawyer") errors.push("ground_truth_reviewer_invalid");
    if (!input.lawyer_ground_truth.review_ref.trim()) errors.push("ground_truth_review_ref_missing");
  }
  return errors;
}

const PENDING_DOC: ApprovedDocumentRef = {
  document_ref: "fixture://approved-anonymized-document",
  sha256: "0".repeat(64),
  provenance_ref: "fixture:q0:document",
  anonymized: true,
  approval_ref: "fixture:q0:approval",
};

const DEFAULT_FIELDS: readonly CanonicalFieldId[] = [
  "company.name",
  "company.inn",
  "tax.position_summary",
];

function pendingCase(templateCode: FlagshipTemplateCode09A): Q0BenchmarkCase {
  return {
    case_id: `q0-${templateCode}-001`,
    case_version: Q0_BENCHMARK_VERSION,
    evaluation_version: AI_FILL_EVALUATION_VERSION,
    template_code: templateCode,
    template_revision: "fixture-pending-real-template-revision",
    schema_revision: "fixture-pending-real-schema-revision",
    documents: [PENDING_DOC],
    expected_field_ids: DEFAULT_FIELDS,
    recorded_output: null,
    lawyer_ground_truth: null,
    status: "recorded_output_pending",
    synthetic_contract_only: true,
  };
}

/**
 * Contract-only Q0 manifest. These five entries deliberately contain no model
 * output or lawyer ground truth and therefore make no accuracy/non-regression
 * claim. They are placeholders until approved anonymized real cases, recorded
 * outputs and lawyer-reviewed truth are supplied under separate authorization.
 */
export const Q0_BENCHMARK_MANIFEST_09B: readonly Q0BenchmarkCase[] =
  FLAGSHIP_TEMPLATE_CODES_09A.map(pendingCase);
