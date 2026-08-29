from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"{label} anchor mismatch")
    return text.replace(old, new, 1)


route_path = Path("src/routes/workspace.generated-documents.$documentId.tsx")
route = route_path.read_text()

route = replace_once(route,
'''      const { error } = await supabase
        .from("generated_legal_documents")
        .update({ content: edited, updated_at: new Date().toISOString() })
        .eq("id", doc.id);''',
'''      const { error } = await supabase
        .from("generated_legal_documents")
        .update({
          content: edited,
          ai_review_status: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);''',
"saveEdits")

route = replace_once(route,
'''        .select("status,ai_result")
        .eq("generated_document_id" as any, doc.id)''',
'''        .select("status,ai_result,created_at,completed_at")
        .eq("generated_document_id" as any, doc.id)''',
"approval review select")

route = replace_once(route,
'''      if (latestReviewError) throw latestReviewError;
      assertReviewAllowsApproval(latestReviewRun);

      const { data: u } = await supabase.auth.getUser();''',
'''      if (latestReviewError) throw latestReviewError;

      const { data: currentDoc, error: currentDocError } = await supabase
        .from("generated_legal_documents")
        .select("updated_at")
        .eq("id", doc.id)
        .maybeSingle();
      if (currentDocError) throw currentDocError;
      if (!currentDoc) throw new Error("Document approval blocked: document_not_found");
      assertReviewAllowsApproval(latestReviewRun, currentDoc.updated_at);

      const { data: u } = await supabase.auth.getUser();''',
"approval current document")

route = replace_once(route,
'''        review,
        reviewCompleted:
          !!reviewRun && String(reviewRun.status ?? "").toLowerCase() === "completed",
        sourceWarnings:''',
'''        review,
        reviewCompleted:
          !!reviewRun && String(reviewRun.status ?? "").toLowerCase() === "completed",
        reviewCompletedAt:
          (reviewRun as any)?.completed_at ?? (reviewRun as any)?.created_at ?? null,
        documentUpdatedAt: doc?.updated_at ?? null,
        sourceWarnings:''',
"readiness freshness args")

route = replace_once(route,
'''    [consistency, review, reviewRun, matterSnapshot?.source_warnings],''',
'''    [consistency, review, reviewRun, doc?.updated_at, matterSnapshot?.source_warnings],''',
"readiness deps")

route_path.write_text(route)

readiness_path = Path("src/lib/document-readiness.ts")
readiness = readiness_path.read_text()
readiness = replace_once(readiness,
'''  review: any | null; // review_run.ai_result
  reviewCompleted: boolean;
  // Source Review warnings''',
'''  review: any | null; // review_run.ai_result
  reviewCompleted: boolean;
  reviewCompletedAt?: string | null;
  documentUpdatedAt?: string | null;
  // Source Review warnings''',
"readiness input")

readiness = replace_once(readiness,
'''  if (!input.reviewCompleted) {
    reasons.push("review_not_completed");
  } else if (!validReviewStatuses.has(reviewStatus)) {
    reasons.push("review_result_invalid");
  }''',
'''  if (!input.reviewCompleted) {
    reasons.push("review_not_completed");
  } else if (!validReviewStatuses.has(reviewStatus)) {
    reasons.push("review_result_invalid");
  } else if (
    input.reviewCompletedAt &&
    input.documentUpdatedAt &&
    new Date(input.reviewCompletedAt).getTime() < new Date(input.documentUpdatedAt).getTime()
  ) {
    reasons.push("review_stale");
  }''',
"readiness stale")
readiness_path.write_text(readiness)

approval_path = Path("src/lib/document-approval.ts")
approval = approval_path.read_text()
approval = replace_once(approval,
'''export type ReviewRunForApproval = { status?: unknown; ai_result?: unknown } | null;''',
'''export type ReviewRunForApproval = {
  status?: unknown;
  ai_result?: unknown;
  created_at?: unknown;
  completed_at?: unknown;
} | null;''',
"approval run type")

approval = replace_once(approval,
'''  | { allowed: false; reason: "review_not_completed" | "review_result_invalid" | "review_not_passed" };''',
'''  | { allowed: false; reason: "review_not_completed" | "review_result_invalid" | "review_not_passed" | "review_stale" };''',
"approval reason type")

approval = replace_once(approval,
'''export function evaluateReviewApproval(reviewRun: ReviewRunForApproval): ReviewApprovalGate {''',
'''export function evaluateReviewApproval(
  reviewRun: ReviewRunForApproval,
  documentUpdatedAt?: string | null,
): ReviewApprovalGate {''',
"approval signature")

approval = replace_once(approval,
'''  if (reviewStatus !== "passed") return { allowed: false, reason: "review_not_passed" };
  return { allowed: true, reason: null };''',
'''  if (reviewStatus !== "passed") return { allowed: false, reason: "review_not_passed" };

  const reviewCompletedAt = String(reviewRun.completed_at ?? reviewRun.created_at ?? "");
  if (reviewCompletedAt && documentUpdatedAt) {
    const reviewTime = new Date(reviewCompletedAt).getTime();
    const documentTime = new Date(documentUpdatedAt).getTime();
    if (Number.isFinite(reviewTime) && Number.isFinite(documentTime) && reviewTime < documentTime) {
      return { allowed: false, reason: "review_stale" };
    }
  }

  return { allowed: true, reason: null };''',
"approval stale")

approval = replace_once(approval,
'''export function assertReviewAllowsApproval(reviewRun: ReviewRunForApproval): void {
  const gate = evaluateReviewApproval(reviewRun);''',
'''export function assertReviewAllowsApproval(
  reviewRun: ReviewRunForApproval,
  documentUpdatedAt?: string | null,
): void {
  const gate = evaluateReviewApproval(reviewRun, documentUpdatedAt);''',
"approval assert")
approval_path.write_text(approval)

Path("supabase/tests/prompt07f-stale-review-readiness.test.ts").write_text('''import { describe, expect, test } from "bun:test";
import { computeDocumentReadiness } from "../../src/lib/document-readiness";
import { evaluateReviewApproval } from "../../src/lib/document-approval";

const consistency = {
  ready: true,
  criticalFailed: [],
  warningsFailed: [],
  blockReason: null,
};

describe("Prompt 07F stale Reviewer freshness gate", () => {
  test("readiness allows current passed review", () => {
    const result = computeDocumentReadiness({
      consistency,
      review: { review_status: "passed", problems: [] },
      reviewCompleted: true,
      reviewCompletedAt: "2026-08-29T15:30:00.000Z",
      documentUpdatedAt: "2026-08-29T15:29:00.000Z",
    });
    expect(result.status).toBe("READY");
  });

  test("readiness rejects stale passed review", () => {
    const result = computeDocumentReadiness({
      consistency,
      review: { review_status: "passed", problems: [] },
      reviewCompleted: true,
      reviewCompletedAt: "2026-08-29T15:29:00.000Z",
      documentUpdatedAt: "2026-08-29T15:30:00.000Z",
    });
    expect(result.status).toBe("NEEDS_REVISION");
    expect(result.reasons).toContain("review_stale");
  });

  test("approval accepts current completed passed review", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "passed" },
        completed_at: "2026-08-29T15:30:00.000Z",
      },
      "2026-08-29T15:29:00.000Z",
    )).toEqual({ allowed: true, reason: null });
  });

  test("approval rejects stale completed passed review", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "passed" },
        completed_at: "2026-08-29T15:29:00.000Z",
      },
      "2026-08-29T15:30:00.000Z",
    )).toEqual({ allowed: false, reason: "review_stale" });
  });

  test("existing non-passed behavior remains fail closed", () => {
    expect(evaluateReviewApproval(
      {
        status: "completed",
        ai_result: { review_status: "needs_revision" },
        completed_at: "2026-08-29T15:31:00.000Z",
      },
      "2026-08-29T15:30:00.000Z",
    )).toEqual({ allowed: false, reason: "review_not_passed" });
  });
});
''')
