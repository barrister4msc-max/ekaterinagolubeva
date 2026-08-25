import { supabase } from "@/integrations/supabase/client";

export type ExternalLegalResearchProvider = "strizh" | "garant" | "consultant" | "other" | "kad";

export type ExternalLegalResearchCandidateDraft = {
  title?: string | null;
  url?: string | null;
  citation?: string | null;
  excerpt?: string | null;
  source_type?: string | null;
  code?: string | null;
  article?: string | null;
  part?: string | null;
  case_number?: string | null;
  document_number?: string | null;
  document_date?: string | null;
  research_issue_ids?: string[];
};

export type ExternalLegalResearchImportDraft = {
  provider: ExternalLegalResearchProvider;
  answer_text?: string | null;
  links?: string[];
  candidates?: ExternalLegalResearchCandidateDraft[];
  research_issue_ids?: string[];
};

const PROVIDERS = new Set<ExternalLegalResearchProvider>([
  "strizh",
  "garant",
  "consultant",
  "other",
]);

const MAX_IMPORTS = 8;
const MAX_LINKS = 20;
const MAX_CANDIDATES = 20;
const MAX_ISSUES = 20;
const MAX_TEXT = 4_000;
const MAX_EXCERPT = 8_000;

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function uniqText(values: unknown, maxItems: number, maxLength = MAX_TEXT): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map((value) => text(value, maxLength))
      .filter((value): value is string => !!value),
  )].slice(0, maxItems);
}

function provider(value: unknown): ExternalLegalResearchProvider | null {
  const normalized = text(value, 32)?.toLowerCase() as ExternalLegalResearchProvider | undefined;
  return normalized && PROVIDERS.has(normalized) ? normalized : null;
}

function sanitizeCandidate(value: unknown): ExternalLegalResearchCandidateDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const result: ExternalLegalResearchCandidateDraft = {
    title: text(raw.title),
    url: text(raw.url),
    citation: text(raw.citation),
    excerpt: text(raw.excerpt, MAX_EXCERPT),
    source_type: text(raw.source_type, 128),
    code: text(raw.code, 128),
    article: text(raw.article, 128),
    part: text(raw.part, 128),
    case_number: text(raw.case_number, 256),
    document_number: text(raw.document_number, 256),
    document_date: text(raw.document_date, 64),
    research_issue_ids: uniqText(raw.research_issue_ids, MAX_ISSUES, 256),
  };

  const identifiable =
    result.url ||
    result.citation ||
    result.document_number ||
    result.case_number ||
    result.title;
  return identifiable ? result : null;
}

export function sanitizeExternalLegalResearchImports(
  value: unknown,
): ExternalLegalResearchImportDraft[] {
  if (!Array.isArray(value)) return [];
  const imports: ExternalLegalResearchImportDraft[] = [];

  for (const item of value.slice(0, MAX_IMPORTS)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const normalizedProvider = provider(raw.provider);
    if (!normalizedProvider) continue;

    const candidates = Array.isArray(raw.candidates)
      ? raw.candidates
          .slice(0, MAX_CANDIDATES)
          .map(sanitizeCandidate)
          .filter((candidate): candidate is ExternalLegalResearchCandidateDraft => !!candidate)
      : [];

    imports.push({
      provider: normalizedProvider,
      answer_text: text(raw.answer_text, MAX_TEXT),
      links: uniqText(raw.links, MAX_LINKS),
      candidates,
      research_issue_ids: uniqText(raw.research_issue_ids, MAX_ISSUES, 256),
    });
  }

  return imports;
}

export async function loadExternalLegalResearchImports(
  sessionId: string,
): Promise<ExternalLegalResearchImportDraft[]> {
  const { data, error } = await supabase
    .from("document_intake_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  return sanitizeExternalLegalResearchImports(metadata.external_legal_research_imports);
}

export async function saveExternalLegalResearchImports(
  sessionId: string,
  imports: ExternalLegalResearchImportDraft[],
): Promise<ExternalLegalResearchImportDraft[]> {
  const sanitized = sanitizeExternalLegalResearchImports(imports);

  // Preserve every unrelated metadata key. The Analyzer owns only the
  // `external_legal_research_imports` key for this staging contract.
  const { data: current, error: readError } = await supabase
    .from("document_intake_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("Intake session not found");

  const metadata = ((current.metadata ?? {}) as Record<string, unknown>);
  const nextMetadata = {
    ...metadata,
    external_legal_research_imports: sanitized,
  };

  const { error: updateError } = await supabase
    .from("document_intake_sessions")
    .update({ metadata: nextMetadata as any })
    .eq("id", sessionId);
  if (updateError) throw updateError;

  return sanitized;
}

export async function clearExternalLegalResearchImports(sessionId: string): Promise<void> {
  await saveExternalLegalResearchImports(sessionId, []);
}
