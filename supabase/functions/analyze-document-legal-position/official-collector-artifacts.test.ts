import { expect, test } from "bun:test";
import { searchOfficialCollectorArtifacts } from "./official-collector-artifacts.ts";
import { mergeOfficialWithLocalSources } from "./repositories.ts";
import { applyRuntimeSourceAdmission } from "./source-use-admission.ts";

function chain(result: any[]) {
  const api: any = {
    select: () => api,
    eq: () => api,
    filter: () => api,
    in: () => api,
    ilike: () => api,
    limit: async () => ({ data: result }),
  };
  return api;
}

function fakeSb(chunks: any[], registry: any[]) {
  return {
    from(table: string) {
      if (table === "legal_knowledge_chunks") return chain(chunks);
      if (table === "legal_source_registry") {
        const api: any = {
          select: () => api,
          in: async () => ({ data: registry }),
        };
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

const query = {
  legal_issues: ["Применение статьи 54.1 НК РФ"],
  research_topics: ["налоговая выгода"],
  articles: ["ст. 54.1 НК РФ"],
} as any;

function artifact(sourceType: string, registryId = "11111111-1111-1111-1111-111111111111") {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    title: "Официальный документ",
    content: "Официальный текст налогового документа и правовой позиции по статье 54.1 НК РФ.",
    source_type: sourceType,
    metadata: {
      source_namespace: "official_tax_core",
      source_registry_id: registryId,
      source_provider_id: sourceType.startsWith("vsrf") ? "vsrf" : sourceType.startsWith("fns") ? "fns" : "minfin",
      official_origin_verified: true,
      content_verified: true,
      temporal_verified: true,
      freshness_status: "current",
    },
  };
}

function registry(sourceType: string, provider: "vsrf" | "fns" | "minfin") {
  const url = provider === "vsrf"
    ? "https://vsrf.ru/documents/own/28483/"
    : provider === "fns"
      ? "https://www.nalog.gov.ru/rn77/about_fts/about_nalog/10687108/"
      : "https://minfin.gov.ru/ru/perfomance/tax_relations/Answers/";
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Официальный документ",
    source_type: sourceType,
    official_url: url,
    document_number: sourceType === "vsrf_plenum" ? "48" : "БВ-4-7/3060@",
    publication_date: sourceType === "vsrf_plenum" ? "2019-11-26" : "2021-03-10",
    citation: "Официальный документ",
    verification_status: "official_origin_verified",
    current_status: "active",
    metadata: {
      source_provider_id: provider,
      official_origin_verified: true,
      content_verified: true,
      temporal_verified: true,
      freshness_status: "current",
    },
  };
}

test("court_practice gets an official VSRF candidate from collector artifacts", async () => {
  const result = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("vsrf_plenum")], [registry("vsrf_plenum", "vsrf")]),
    query,
    "court_practice",
  );
  expect(result.coverage_gaps).toEqual([]);
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0].bucket).toBe("court_practice");
  expect(result.sources[0].metadata.safety).toMatchObject({
    official_origin_verified: true,
    document_identity_verified: true,
    content_verified: true,
    actuality_status: "verified",
    substantive_use_allowed: true,
  });
});

test("FNS and Minfin buckets use their collector source families", async () => {
  const fns = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("fns_letter")], [registry("fns_letter", "fns")]),
    query,
    "fns_letters",
  );
  const minfin = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("minfin_letter")], [registry("minfin_letter", "minfin")]),
    query,
    "minfin_letters",
  );
  expect(fns.sources[0].metadata.provider_id).toBe("fns");
  expect(minfin.sources[0].metadata.provider_id).toBe("minfin");
});

test("missing official collector result creates an explicit coverage gap", async () => {
  const result = await searchOfficialCollectorArtifacts(fakeSb([], []), query, "court_practice");
  expect(result.sources).toEqual([]);
  expect(result.coverage_gaps).toEqual([
    { bucket: "court_practice", reason: "official_collector_result_missing" },
  ]);
});

test("artifact without explicit temporal freshness remains fail-closed", async () => {
  const chunk = artifact("vsrf_review");
  delete chunk.metadata.temporal_verified;
  delete chunk.metadata.freshness_status;
  const reg = registry("vsrf_review", "vsrf");
  delete reg.metadata.temporal_verified;
  delete reg.metadata.freshness_status;
  const result = await searchOfficialCollectorArtifacts(fakeSb([chunk], [reg]), query, "court_practice");
  expect(result.sources[0].metadata.safety).toMatchObject({
    content_verified: true,
    actuality_status: "unknown",
    substantive_use_allowed: false,
    verification_level: "content",
  });
});

test("non-official host cannot self-promote even with positive metadata", async () => {
  const reg = registry("vsrf_case", "vsrf");
  reg.official_url = "https://example.com/case";
  const result = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("vsrf_case")], [reg]),
    query,
    "court_practice",
  );
  expect(result.sources[0].metadata.safety).toMatchObject({
    official_origin_verified: false,
    substantive_use_allowed: false,
    verification_level: "discovery",
  });
});


test("synthetic tax issue admits all four verified families and blocks missing official evidence", async () => {
  const law = {
    source_ref: "law:nk:54.1",
    source_id: "law-54.1",
    metadata: {
      substantive_use_allowed: true,
      content_verified: true,
      temporal_verified: true,
      freshness_status: "verified",
    },
  };
  const court = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("vsrf_plenum")], [registry("vsrf_plenum", "vsrf")]),
    query,
    "court_practice",
  );
  const fns = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("fns_letter")], [registry("fns_letter", "fns")]),
    query,
    "fns_letters",
  );
  const minfin = await searchOfficialCollectorArtifacts(
    fakeSb([artifact("minfin_letter")], [registry("minfin_letter", "minfin")]),
    query,
    "minfin_letters",
  );
  const missing = await searchOfficialCollectorArtifacts(fakeSb([], []), query, "fns_letters");

  const officialSources = [...court.sources, ...fns.sources, ...minfin.sources];
  const localSources = officialSources.map((official, index) => ({
    bucket: official.bucket,
    source_table: "legal_knowledge_chunks",
    source_id: `local-${index}`,
    source_type: official.source_type,
    title: official.title,
    official_url: null,
    citation: official.citation,
    snippet: "internal retrieval snapshot",
    metadata: { canonical_document_key: official.metadata.canonical_document_key },
  }));
  const linked = mergeOfficialWithLocalSources(localSources as any, officialSources);
  const sources = applyRuntimeSourceAdmission([law, ...linked.sources] as any);

  expect(linked.linked).toBe(3);
  expect(sources).toHaveLength(4);
  expect(sources.every((source: any) => source.use_in_generation === true)).toBe(true);
  expect(sources.every((source: any) => source.metadata.source_use_admission.status === "admitted")).toBe(true);
  expect(missing.coverage_gaps).toEqual([
    { bucket: "fns_letters", reason: "official_collector_result_missing" },
  ]);
});
