import { describe, expect, test } from "bun:test";
import {
  buildCanonicalDocumentKey,
  buildSemanticResearchPlan,
  evaluateOfficialSourceSafety,
  extractFederalLawRefs,
  isOfficialLegalUrl,
  officialSourcesEnabledFromValue,
  resolvePravoApiBase,
  searchOfficialLegalSources,
  type OfficialSourceResult,
} from "./official-sources.ts";
import { mergeOfficialWithLocalSources, type RawSource } from "./repositories.ts";
import type { ResearchQuery } from "./fact-extraction.ts";

function query(overrides: Partial<ResearchQuery> = {}): ResearchQuery {
  return {
    practice_area: "tax",
    subcategory: null,
    document_type: null,
    facts: [],
    parties: [],
    amounts: [],
    dates: [],
    legal_issues: [],
    research_topics: [],
    keywords: [],
    articles: [],
    organizations: [],
    inn: [],
    ogrn: [],
    semantic_intents: [],
    legal_concepts: [],
    metadata_terms: [],
    search_hypotheses: [],
    ...overrides,
  };
}

describe("Official Source Safety Contract", () => {
  test("feature flag is OFF by default and only explicit truthy values enable it", () => {
    expect(officialSourcesEnabledFromValue(undefined)).toBe(false);
    expect(officialSourcesEnabledFromValue("")).toBe(false);
    expect(officialSourcesEnabledFromValue("false")).toBe(false);
    expect(officialSourcesEnabledFromValue("true")).toBe(true);
    expect(officialSourcesEnabledFromValue("1")).toBe(true);
  });

  test("approved automatic Pravo retrieval does not depend on the legacy feature flag", async () => {
    const originalFetch = globalThis.fetch;
    const eoNumber = "0001202511280001";
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.endsWith("/Documents")) {
        return Response.json({ items: [{
          eoNumber,
          number: "425-ФЗ",
          documentDate: "2025-11-28",
          complexName: "Федеральный закон",
        }] });
      }
      if (url.pathname.endsWith("/DocumentText")) return Response.json({ text: "Официальный текст" });
      if (url.pathname.endsWith("/Document")) return Response.json({
        eoNumber,
        number: "425-ФЗ",
        documentDate: "2025-11-28",
        complexName: "Федеральный закон",
      });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    try {
      const result = await searchOfficialLegalSources(query({
        research_topics: ["Федеральный закон от 28.11.2025 № 425-ФЗ"],
      }), { execution_mode: "approved_automatic" });
      expect(result.diagnostics.enabled).toBe(true);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.source_id).toBe(`pravo:${eoNumber}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("accepts only registered official HTTPS hosts, rejecting lookalikes", () => {
    expect(isOfficialLegalUrl("https://publication.pravo.gov.ru/document/123")).toBe(true);
    expect(isOfficialLegalUrl("https://nalog.gov.ru/test")).toBe(true);
    expect(isOfficialLegalUrl("https://minfin.gov.ru/test")).toBe(true);
    expect(isOfficialLegalUrl("https://vsrf.ru/test")).toBe(true);
    expect(isOfficialLegalUrl("https://kad.arbitr.ru/test")).toBe(true);
    expect(isOfficialLegalUrl("http://publication.pravo.gov.ru/document/123")).toBe(false);
    expect(isOfficialLegalUrl("https://publication.pravo.gov.ru.evil.example/document/123")).toBe(false);
  });

  test("official origin and identity without content cannot be used substantively", () => {
    const safety = evaluateOfficialSourceSafety({
      officialUrl: "https://publication.pravo.gov.ru/document/123",
      identityVerified: true,
      contentVerified: false,
      actualityStatus: "unknown",
    });
    expect(safety.official_origin_verified).toBe(true);
    expect(safety.document_identity_verified).toBe(true);
    expect(safety.content_verified).toBe(false);
    expect(safety.substantive_use_allowed).toBe(false);
    expect(safety.verification_level).toBe("identity");
  });

  test("substantive use requires origin + identity + content + actuality", () => {
    const safety = evaluateOfficialSourceSafety({
      officialUrl: "https://publication.pravo.gov.ru/document/123",
      identityVerified: true,
      contentVerified: true,
      actualityStatus: "verified",
    });
    expect(safety.substantive_use_allowed).toBe(true);
    expect(safety.verification_level).toBe("substantive");
  });

  test("relay configuration changes transport only and rejects insecure relay URLs", () => {
    expect(resolvePravoApiBase(undefined)).toBe("https://publication.pravo.gov.ru/api");
    expect(resolvePravoApiBase("http://relay.example/api")).toBe("https://publication.pravo.gov.ru/api");
    expect(resolvePravoApiBase("https://relay.example/api/")).toBe("https://relay.example/api");
    expect(isOfficialLegalUrl("https://relay.example/document/123")).toBe(false);
    expect(isOfficialLegalUrl("https://publication.pravo.gov.ru/document/123")).toBe(true);
  });
});

describe("Semantic Legal Research Contract", () => {
  test("keeps search hypotheses separate from established facts", () => {
    const q = query({
      facts: ["Инспекция исключила вычеты по НДС"],
      legal_issues: ["обоснованность налоговой выгоды"],
      semantic_intents: ["реальность хозяйственных операций"],
      legal_concepts: ["налоговая реконструкция"],
      search_hypotheses: ["проверить практику о техническом контрагенте"],
      metadata_terms: ["НДС", "выездная налоговая проверка"],
    });
    const plan = buildSemanticResearchPlan(q);
    expect(plan.search_hypotheses).toContain("проверить практику о техническом контрагенте");
    expect(q.facts).toEqual(["Инспекция исключила вычеты по НДС"]);
    expect(q.facts).not.toContain("проверить практику о техническом контрагенте");
    expect(plan.semantic_intents).toContain("налоговая реконструкция");
    expect(plan.metadata_terms).toContain("НДС");
  });

  test("extracts date with federal-law number and does not invent year for bare number", () => {
    const refs = extractFederalLawRefs(query({
      research_topics: [
        "Федеральный закон от 28.11.2025 № 425-ФЗ",
        "проверить также 102-ФЗ",
      ],
    }));
    expect(refs).toContainEqual({
      number: "425-ФЗ",
      date: "2025-11-28",
      year: "2025",
      raw: "от 28.11.2025 № 425-ФЗ",
    });
    const bare = refs.find((r) => r.number === "102-ФЗ");
    expect(bare?.date).toBeNull();
    expect(bare?.year).toBeNull();
  });
});

describe("Canonical dedupe / verification linking", () => {
  test("links discovery metadata to matching local content instead of injecting an unverified duplicate", () => {
    const canonical = buildCanonicalDocumentKey({
      bucket: "laws",
      documentNumber: "425-ФЗ",
      documentDate: "2025-11-28",
    });
    const local: RawSource = {
      bucket: "laws",
      source_table: "legal_knowledge_chunks",
      source_id: "local-1",
      source_type: "federal_law",
      title: "Федеральный закон № 425-ФЗ",
      official_url: null,
      citation: "425-ФЗ",
      snippet: "Локально сохраненный текст закона",
      metadata: {
        document_number: "425-ФЗ",
        document_date: "2025-11-28",
        canonical_document_key: canonical,
      },
    };
    const safety = evaluateOfficialSourceSafety({
      officialUrl: "https://publication.pravo.gov.ru/document/0001",
      identityVerified: true,
      contentVerified: false,
      actualityStatus: "unknown",
    });
    const official: OfficialSourceResult = {
      bucket: "laws",
      source_table: "external_official_source",
      source_id: "pravo:0001",
      source_type: "official_publication_pravo",
      title: "Официальная публикация",
      official_url: "https://publication.pravo.gov.ru/document/0001",
      citation: "425-ФЗ",
      snippet: "metadata only",
      metadata: {
        canonical_document_key: canonical,
        safety,
        provider: "publication.pravo.gov.ru",
        retrieved_at: "2026-08-17T00:00:00.000Z",
      },
    };

    const merged = mergeOfficialWithLocalSources([local], [official]);
    expect(merged.linked).toBe(1);
    expect(merged.substantiveExternal).toBe(0);
    expect(merged.sources).toHaveLength(1);
    expect(merged.sources[0].source_id).toBe("local-1");
    expect(merged.sources[0].official_url).toBe(official.official_url);
  });

  test("does not inject discovery-only external result when no local canonical match exists", () => {
    const safety = evaluateOfficialSourceSafety({
      officialUrl: "https://publication.pravo.gov.ru/document/0002",
      identityVerified: false,
      contentVerified: false,
      actualityStatus: "unknown",
    });
    const official: OfficialSourceResult = {
      bucket: "laws",
      source_table: "external_official_source",
      source_id: "pravo:0002",
      source_type: "official_publication_pravo",
      title: "Неоднозначная публикация",
      official_url: "https://publication.pravo.gov.ru/document/0002",
      citation: null,
      snippet: "metadata only",
      metadata: { safety },
    };
    const merged = mergeOfficialWithLocalSources([], [official]);
    expect(merged.sources).toHaveLength(0);
    expect(merged.substantiveExternal).toBe(0);
  });

  test("deduplicates a canonical external source while preserving multi-provider provenance", () => {
    const canonical = "ru:laws:document:0003:2026-01-01";
    const safety = evaluateOfficialSourceSafety({
      officialUrl: "https://publication.pravo.gov.ru/document/0003",
      identityVerified: true,
      contentVerified: true,
      actualityStatus: "verified",
    });
    const first: OfficialSourceResult = {
      bucket: "laws", source_table: "external_official_source", source_id: "pravo:0003",
      source_type: "official_publication_pravo", title: "Документ", official_url: "https://publication.pravo.gov.ru/document/0003",
      citation: "0003", snippet: "metadata only",
      metadata: { canonical_document_key: canonical, safety, provider_id: "pravo" },
    };
    const second: OfficialSourceResult = {
      ...first,
      source_id: "law7:0003",
      official_url: "https://law7.ru/document/0003",
      metadata: { canonical_document_key: canonical, safety, provider_id: "law7" },
    };
    const merged = mergeOfficialWithLocalSources([], [first, second]);
    expect(merged.sources).toHaveLength(1);
    expect(merged.substantiveExternal).toBe(1);
    expect(merged.sources[0].metadata.official_provider_provenance).toEqual([
      { provider_id: "pravo", source_id: "pravo:0003", official_url: "https://publication.pravo.gov.ru/document/0003" },
      { provider_id: "law7", source_id: "law7:0003", official_url: "https://law7.ru/document/0003" },
    ]);
  });
});
