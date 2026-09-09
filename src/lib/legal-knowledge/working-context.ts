export type SourceMetadata = Record<string, unknown>;

const INDEPENDENTLY_VERIFIED = new Set([
  "official_verified",
  "verified_local_source",
  "externally_verified",
]);

/**
 * Enables a lawyer-reviewed source as provisional working context.
 * It intentionally cannot turn a source into an officially verified authority
 * or permit it to support a substantive conclusion.
 */
export function approveForWorkingContext(
  existing: SourceMetadata,
  userId: string,
  approvedAt: string,
): SourceMetadata {
  const previousStatus =
    typeof existing.verification_status === "string"
      ? existing.verification_status
      : "needs_review";

  return {
    ...existing,
    // Never infer official origin from a domain name or a UI approval.
    official_status:
      typeof existing.official_status === "string"
        ? existing.official_status
        : "unverified",
    verification_status: INDEPENDENTLY_VERIFIED.has(previousStatus)
      ? previousStatus
      : "lawyer_reviewed_working_source",
    import_status: "completed",
    working_context_allowed: true,
    substantive_use_allowed: false,
    approved_by_lawyer: true,
    approved_by: userId,
    approved_at: approvedAt,
  };
}
