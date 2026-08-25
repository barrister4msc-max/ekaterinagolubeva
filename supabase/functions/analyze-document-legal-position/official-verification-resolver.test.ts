import { describe, expect, test } from "bun:test";
import { evaluateOfficialSourceSafety } from "./official-sources.ts";
import {
  applyLaw7OfficialVerification,
  resolveLaw7OfficialVerification,
  type OfficialContentObservation,
  type PravoVerificationCandidate,
  type VerifiableLaw7Source,
} from "./official-verification-resolver.ts";

function law7(overrides: Partial<VerifiableLaw7Source> = {}): VerifiableLaw7Source {
  return {
    source_id: "law7:get-article-version:NK_RF:54.1:2000-07-31",
    source_type: "law7_article_version",
    official_url: null,
    snippet: "Статья 54.1. Пределы осуществления прав по исчислению налоговой базы.",
    article: "54.1",
    metadata: {
      provider_id: "law7",
      provider_source_class: "retrieval_intermediary",
      law7_code_id: "NK_RF",
      article: "54.1",
      // Current-only corpus metadata. This is not inferred to be the date of
      // the amending act that introduced article 54.1.
      version_date: "2000-07-31",
      substantive_use_allowed: false,
      article_text: "Статья 54.1. Пределы осуществления прав по исчислению налоговой базы.",
    },
    ...overrides,
  };
}

function observation(overrides: Partial<OfficialContentObservation> = {}): OfficialContentObservation {
  return {
    provider_id: "pravo",
    official_source_id: "pravo:0001201708190001",
    official_url: "https://publication.pravo.gov.ru/document/0001201708190001",
    eo_number: "0001201708190001",
    code_id: "NK_RF",
    article: "54.1",
    article_text: "Статья 54.1. Пределы осуществления прав по исчислению налоговой базы.",
    content_source: "documented_official_content",
    actuality_status: "verified",
    observed_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function pravo(obs: OfficialContentObservation | null, suffix = "1"): PravoVerificationCandidate {
  const url = obs?.official_url ?? `https://publication.pravo.gov.ru/document/${suffix}`;
  return {
    source_id: obs?.official_source_id ?? `pravo:${suffix}`,
    official_url: url,
    metadata: {
      provider_id: "pravo",
      eo_number: obs?.eo_number ?? suffix,
      safety: evaluateOfficialSourceSafety({
        officialUrl: url,
        identityVerified: true,
        contentVerified: false,
        actualityStatus: "unknown",
      }),
      ...(obs ? { content_observation: obs } : {}),
    },
  };
}

describe("Pravo ↔ Law7 deterministic official verification", () => {
  test("NK_RF article 54.1 stays fail-closed when documented official content is absent", () => {
    const result = resolveLaw7OfficialVerification(law7(), [pravo(null)]);
    expect(result.status).toBe("no_content");
    expect(result.substantive_use_allowed).toBe(false);

    const applied = applyLaw7OfficialVerification(law7(), [pravo(null)]);
    expect(applied.metadata.substantive_use_allowed).toBe(false);
    expect((applied.metadata.official_verification_resolution as any).status).toBe("no_content");
  });

  test("content mismatch remains fail-closed", () => {
    const obs = observation({ article_text: "ДРУГОЙ ТЕКСТ" });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("content_mismatch");
    expect(result.substantive_use_allowed).toBe(false);
    expect(result.safety?.content_verified).toBe(false);
  });

  test("ambiguous exact observations remain fail-closed", () => {
    const first = observation();
    const second = observation({
      official_source_id: "pravo:0001201708190002",
      official_url: "https://publication.pravo.gov.ru/document/0001201708190002",
      eo_number: "0001201708190002",
    });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(first), pravo(second)]);
    expect(result.status).toBe("ambiguous");
    expect(result.substantive_use_allowed).toBe(false);
  });

  test("unknown actuality remains fail-closed even with exact content", () => {
    const obs = observation({ actuality_status: "unknown" });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("unknown_actuality");
    expect(result.substantive_use_allowed).toBe(false);
    expect(result.safety?.content_verified).toBe(true);
    expect(result.safety?.actuality_status).toBe("unknown");
  });

  test("norm identity mismatch remains fail-closed", () => {
    const obs = observation({ article: "88" });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("no_identity");
    expect(result.substantive_use_allowed).toBe(false);
  });

  test("explicit version binding mismatch remains fail-closed", () => {
    const obs = observation({ law7_version_date: "2017-07-19" });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("no_identity");
    expect(result.substantive_use_allowed).toBe(false);
  });

  test("current-only Law7 corpus date is not required to equal an official act date", () => {
    const obs = observation();
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("verified");
    expect(result.substantive_use_allowed).toBe(true);
  });

  test("historical/as-of Law7 results require an explicit version binding", () => {
    const historical = law7({
      metadata: {
        ...law7().metadata,
        requested_as_of_date: "2020-01-01",
      },
    });
    const result = resolveLaw7OfficialVerification(historical, [pravo(observation())]);
    expect(result.status).toBe("no_identity");
    expect(result.substantive_use_allowed).toBe(false);
  });

  test("historical/as-of Law7 results accept only the exact bound version", () => {
    const historical = law7({
      metadata: {
        ...law7().metadata,
        requested_as_of_date: "2020-01-01",
      },
    });
    const result = resolveLaw7OfficialVerification(
      historical,
      [pravo(observation({ law7_version_date: "2000-07-31" }))],
    );
    expect(result.status).toBe("verified");
    expect(result.substantive_use_allowed).toBe(true);
  });



  test("does not promote a Law7 title-only snippet as verified content", () => {
    const source = law7();
    const metadata = { ...source.metadata };
    delete metadata.article_text;
    const result = resolveLaw7OfficialVerification(
      { ...source, metadata },
      [pravo(observation())],
    );
    expect(result.status).toBe("no_content");
    expect(result.substantive_use_allowed).toBe(false);
  });

  test("exact norm identity + exact content + verified actuality may become substantive", () => {
    const obs = observation({
      law7_version_date: "2000-07-31",
      article_text: "Статья 54.1.\u00a0Пределы   осуществления прав по исчислению налоговой базы.",
    });
    const result = resolveLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(result.status).toBe("verified");
    expect(result.substantive_use_allowed).toBe(true);
    expect(result.safety?.verification_level).toBe("substantive");

    const applied = applyLaw7OfficialVerification(law7(), [pravo(obs)]);
    expect(applied.official_url).toBe(obs.official_url);
    expect(applied.metadata.official_origin_verified).toBe(true);
    expect(applied.metadata.document_identity_verified).toBe(true);
    expect(applied.metadata.content_verified).toBe(true);
    expect(applied.metadata.actuality_status).toBe("verified");
    expect(applied.metadata.substantive_use_allowed).toBe(true);
  });
});
