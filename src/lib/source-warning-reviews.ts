// Source Review Center — persistence layer.
//
// Stores reviewer decisions for each source warning produced by
// analyze-document-legal-position. Reviews are NOT a new table — they live
// inside the existing `document_intake_ai_runs.review_result` jsonb column
// under the `source_warning_reviews` key:
//
//   review_result = {
//     ...,
//     source_warning_reviews: {
//       "<source_ref>::<warning_type>": {
//         status: "accepted" | "rejected" | "pending",
//         comment: string,
//         reviewed_at: ISOString,
//         reviewed_by: uuid | null,
//       }
//     }
//   }
//
// Warnings never block draft generation (Phase B contract). The review
// center exists so the lawyer can clear acknowledged warnings from the
// remaining-warnings counter before sending the matter to "ready for lawyer".

import { supabase } from "@/integrations/supabase/client";
import type { LegalAnalysisSourceWarning } from "./legal-analysis";

export type SourceWarningReviewStatus = "pending" | "accepted" | "rejected";

export type SourceWarningReview = {
  status: SourceWarningReviewStatus;
  comment: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type SourceWarningReviewMap = Record<string, SourceWarningReview>;

export function warningKey(w: Pick<LegalAnalysisSourceWarning, "source_ref" | "warning_type">): string {
  return `${w.source_ref}::${w.warning_type}`;
}

export function emptyReview(): SourceWarningReview {
  return { status: "pending", comment: "", reviewed_at: null, reviewed_by: null };
}

export async function loadReviewMap(runId: string): Promise<SourceWarningReviewMap> {
  const { data, error } = await supabase
    .from("document_intake_ai_runs")
    .select("review_result")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  const rr = (data?.review_result ?? {}) as Record<string, unknown>;
  const reviews = (rr.source_warning_reviews ?? {}) as SourceWarningReviewMap;
  return reviews && typeof reviews === "object" ? reviews : {};
}

export async function saveReviewEntry(
  runId: string,
  key: string,
  patch: Partial<SourceWarningReview>,
): Promise<SourceWarningReview> {
  const { data: row, error: readErr } = await supabase
    .from("document_intake_ai_runs")
    .select("review_result")
    .eq("id", runId)
    .maybeSingle();
  if (readErr) throw readErr;

  const current = (row?.review_result ?? {}) as Record<string, unknown>;
  const reviews = { ...((current.source_warning_reviews ?? {}) as SourceWarningReviewMap) };
  const prev = reviews[key] ?? emptyReview();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  const next: SourceWarningReview = {
    status: patch.status ?? prev.status,
    comment: patch.comment ?? prev.comment,
    reviewed_at:
      patch.status && patch.status !== prev.status
        ? new Date().toISOString()
        : (prev.reviewed_at ?? null),
    reviewed_by:
      patch.status && patch.status !== prev.status ? userId : prev.reviewed_by,
  };

  reviews[key] = next;
  const nextReviewResult = { ...current, source_warning_reviews: reviews };

  const { error: writeErr } = await supabase
    .from("document_intake_ai_runs")
    .update({ review_result: nextReviewResult })
    .eq("id", runId);
  if (writeErr) throw writeErr;
  return next;
}

/**
 * Remaining warnings = those whose review status is NOT "accepted".
 * Rejected and pending both stay in the remaining list (the lawyer must
 * still decide what to do, and rejection is "I disagree with this
 * warning" — it must remain visible until accepted).
 */
export function computeRemainingWarnings(
  warnings: LegalAnalysisSourceWarning[],
  reviews: SourceWarningReviewMap,
): LegalAnalysisSourceWarning[] {
  return warnings.filter((w) => (reviews[warningKey(w)]?.status ?? "pending") !== "accepted");
}
