import type { OfficialContentObservation } from "./official-verification-resolver.ts";

export type OfficialContentObservationContext = {
  eoNumber: string;
  officialSourceId: string;
  officialUrl: string;
  codeId: string;
  article: string;
  observedAt?: string;
};

/**
 * Converts an explicitly normalized PublicBlocks payload into an observation.
 *
 * The function intentionally accepts only the documented adapter envelope:
 * `article_text` and `actuality_status` must already be supplied by the
 * transport/parser. Arbitrary nested fields are not guessed or promoted.
 */
export function toOfficialContentObservation(
  payload: unknown,
  context: OfficialContentObservationContext,
): OfficialContentObservation | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const articleText = value.article_text;
  const actualityStatus = value.actuality_status;

  if (
    typeof articleText !== "string" ||
    !articleText.trim() ||
    (actualityStatus !== "verified" && actualityStatus !== "unknown") ||
    !/^\d{16}$/.test(context.eoNumber) ||
    !context.officialSourceId.trim() ||
    !context.officialUrl.trim() ||
    !context.codeId.trim() ||
    !context.article.trim()
  ) {
    return null;
  }

  return {
    provider_id: "pravo",
    official_source_id: context.officialSourceId.trim(),
    official_url: context.officialUrl.trim(),
    eo_number: context.eoNumber,
    code_id: context.codeId.trim(),
    article: context.article.trim(),
    article_text: articleText.trim(),
    content_source: "documented_official_content",
    actuality_status: actualityStatus,
    observed_at: context.observedAt ?? new Date().toISOString(),
  };
}
