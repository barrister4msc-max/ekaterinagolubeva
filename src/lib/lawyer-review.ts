// Lawyer Review workflow — persistence helpers.
// Хранение: generated_legal_documents.metadata.lawyer_review,
//           generated_legal_documents.metadata.ready_for_client,
//           generated_legal_documents.metadata.review_timeline (append).
// Не создаёт таблиц и Edge Functions.

import { supabase } from "@/integrations/supabase/client";

export type LawyerReviewStatus = "not_started" | "in_review" | "approved" | "rejected";

export type LawyerReview = {
  status: LawyerReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  comment: string | null;
  required_fixes: string[];
  approved_version_id: string | null;
};

export type LawyerReviewTimelineEvent = {
  type: "lawyer_review";
  status: LawyerReviewStatus;
  created_at: string;
  reviewed_by?: string | null;
  summary: string;
};

export const DEFAULT_LAWYER_REVIEW: LawyerReview = {
  status: "not_started",
  reviewed_by: null,
  reviewed_at: null,
  comment: null,
  required_fixes: [],
  approved_version_id: null,
};

export function readLawyerReview(meta: Record<string, any> | null | undefined): LawyerReview {
  const raw = (meta?.lawyer_review ?? null) as Partial<LawyerReview> | null;
  if (!raw) return { ...DEFAULT_LAWYER_REVIEW };
  return {
    status: (raw.status as LawyerReviewStatus) ?? "not_started",
    reviewed_by: raw.reviewed_by ?? null,
    reviewed_at: raw.reviewed_at ?? null,
    comment: raw.comment ?? null,
    required_fixes: Array.isArray(raw.required_fixes) ? raw.required_fixes : [],
    approved_version_id: raw.approved_version_id ?? null,
  };
}

export function isReadyForClient(meta: Record<string, any> | null | undefined): boolean {
  return Boolean(meta?.ready_for_client);
}

export function isReadyForLawyer(meta: Record<string, any> | null | undefined): boolean {
  return Boolean(meta?.ready_for_lawyer);
}

type ApplyArgs = {
  documentId: string;
  next: LawyerReview;
  readyForClient: boolean;
  summary: string;
};

async function applyLawyerReview(args: ApplyArgs): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("generated_legal_documents")
    .select("metadata")
    .eq("id", args.documentId)
    .maybeSingle();
  if (readErr) throw readErr;

  const current = (row?.metadata ?? {}) as Record<string, any>;
  const timeline = Array.isArray(current.review_timeline) ? current.review_timeline.slice() : [];
  const event: LawyerReviewTimelineEvent = {
    type: "lawyer_review",
    status: args.next.status,
    created_at: args.next.reviewed_at ?? new Date().toISOString(),
    reviewed_by: args.next.reviewed_by,
    summary: args.summary,
  };
  timeline.push(event);

  const nextMetadata = {
    ...current,
    lawyer_review: args.next,
    ready_for_client: args.readyForClient,
    review_timeline: timeline,
  };

  const { error: writeErr } = await supabase
    .from("generated_legal_documents")
    .update({ metadata: nextMetadata })
    .eq("id", args.documentId);
  if (writeErr) throw writeErr;
}

export async function startLawyerReview(
  documentId: string,
  meta: Record<string, any> | null,
  reviewerId: string | null,
): Promise<LawyerReview> {
  const prev = readLawyerReview(meta);
  const next: LawyerReview = {
    ...prev,
    status: "in_review",
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  };
  await applyLawyerReview({
    documentId,
    next,
    readyForClient: false,
    summary: "Юрист начал проверку документа",
  });
  return next;
}

export async function approveLawyerReview(
  documentId: string,
  meta: Record<string, any> | null,
  reviewerId: string | null,
  comment?: string | null,
): Promise<LawyerReview> {
  const prev = readLawyerReview(meta);
  const next: LawyerReview = {
    ...prev,
    status: "approved",
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    comment: comment ?? prev.comment ?? null,
    required_fixes: [],
    approved_version_id: documentId,
  };
  await applyLawyerReview({
    documentId,
    next,
    readyForClient: true,
    summary: "Документ подтверждён юристом",
  });
  return next;
}

export async function rejectLawyerReview(
  documentId: string,
  meta: Record<string, any> | null,
  reviewerId: string | null,
  comment: string,
  requiredFixes: string[],
): Promise<LawyerReview> {
  const prev = readLawyerReview(meta);
  const next: LawyerReview = {
    ...prev,
    status: "rejected",
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    comment: comment || prev.comment || null,
    required_fixes: requiredFixes.filter((s) => s && s.trim().length > 0),
    approved_version_id: null,
  };
  await applyLawyerReview({
    documentId,
    next,
    readyForClient: false,
    summary: "Документ возвращён юристом на доработку",
  });
  return next;
}
