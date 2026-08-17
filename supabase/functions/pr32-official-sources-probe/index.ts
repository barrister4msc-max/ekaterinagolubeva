// PR32 Preview E2E probe. Temporary; remove before Ready/merge.
import {
  buildCanonicalDocumentKey,
  searchOfficialLegalSources,
} from "../analyze-document-legal-position/official-sources.ts";
import {
  mergeOfficialWithLocalSources,
  type RawSource,
} from "../analyze-document-legal-position/repositories.ts";
import type { ResearchQuery } from "../analyze-document-legal-position/fact-extraction.ts";

Deno.serve(async () => {
  const query: ResearchQuery = {
    practice_area: "tax",
    subcategory: null,
    document_type: "response_to_tax_request",
    facts: ["Синтетический Preview E2E; фактов реального клиента нет"],
    parties: [],
    amounts: [],
    dates: ["28.11.2025"],
    legal_issues: ["налоговое регулирование"],
    research_topics: ["Федеральный закон от 28.11.2025 № 425-ФЗ"],
    keywords: ["Налоговый кодекс", "425-ФЗ"],
    articles: [],
    organizations: [],
    inn: [],
    ogrn: [],
    semantic_intents: ["изменения налогового законодательства"],
    legal_concepts: ["налоговое регулирование"],
    metadata_terms: ["425-ФЗ", "28.11.2025"],
    search_hypotheses: ["проверить официальную публикацию закона"],
  };

  const canonical = buildCanonicalDocumentKey({
    bucket: "laws",
    documentNumber: "425-ФЗ",
    documentDate: "2025-11-28",
  });

  const local: RawSource = {
    bucket: "laws",
    source_table: "legal_knowledge_chunks",
    source_id: "pr32-probe-local-425",
    source_type: "federal_law",
    title: "[PR32 Probe] Федеральный закон № 425-ФЗ",
    official_url: null,
    citation: "425-ФЗ",
    snippet: "Synthetic local substantive source used only to verify canonical linking in PR32 Preview.",
    metadata: {
      document_number: "425-ФЗ",
      document_date: "2025-11-28",
      canonical_document_key: canonical,
      synthetic: true,
    },
  };

  try {
    const official = await searchOfficialLegalSources(query);
    const merged = mergeOfficialWithLocalSources([local], official.sources);
    return new Response(JSON.stringify({
      ok: true,
      flag_enabled: official.diagnostics.enabled,
      diagnostics: official.diagnostics,
      research_plan: official.research_plan,
      official_sources: official.sources.map((s) => ({
        source_id: s.source_id,
        title: s.title,
        official_url: s.official_url,
        citation: s.citation,
        canonical_document_key: s.metadata?.canonical_document_key ?? null,
        safety: s.metadata?.safety ?? null,
      })),
      canonical_expected: canonical,
      merge: {
        linked: merged.linked,
        substantive_external: merged.substantiveExternal,
        source_count: merged.sources.length,
        linked_source: merged.sources[0] ? {
          source_id: merged.sources[0].source_id,
          official_url: merged.sources[0].official_url,
          canonical_document_key: merged.sources[0].metadata?.canonical_document_key ?? null,
          official_verification: merged.sources[0].metadata?.official_verification ?? null,
        } : null,
      },
    }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
