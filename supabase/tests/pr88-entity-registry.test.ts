import { describe, expect, it } from "vitest";

import {
  addEntityRelation,
  applyRegistryTokensToDocument,
  assignEntityRole,
  buildModelFacingEntityContext,
  createEntityRegistry,
  EntityRegistryError,
  readEntityRegistry,
  resolveEntityTokenValue,
  restoreEntityTokensInAnswers,
  upsertEntity,
} from "@/lib/entity-registry";

const SESSION = "session-1";

function seedOrg(name: string, inn?: string) {
  return upsertEntity({
    registry: createEntityRegistry(SESSION),
    candidate: { entity_type: "ORGANIZATION", name, inn: inn ?? null },
    documentId: "doc-1",
  });
}

describe("PR88 entity registry — identity", () => {
  it("assigns stable padded tokens per type", () => {
    let reg = createEntityRegistry(SESSION);
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Альфа"', inn: "7701234567" },
    }).registry;
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "TAX_AUTHORITY", name: "ИФНС России № 7 по г. Москве" },
    }).registry;
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "PERSON", name: "Иванов Иван Иванович" },
    }).registry;
    expect(reg.entities.map((e) => e.entity_id)).toEqual(["ORG_001", "AUTH_001", "PERSON_001"]);
  });

  it("exact INN in two documents = same entity_id, two roles", () => {
    const first = seedOrg('ООО "Альфа"', "7701234567");
    const second = upsertEntity({
      registry: first.registry,
      candidate: { entity_type: "ORGANIZATION", name: "Общество с ограниченной ответственностью «Альфа»", inn: "7701234567" },
      documentId: "doc-2",
      role: "counterparty",
    });
    expect(second.merged).toBe(true);
    expect(second.entity.entity_id).toBe(first.entity.entity_id);
    expect(second.registry.entities).toHaveLength(1);
    const withRole = assignEntityRole({
      registry: second.registry,
      entityId: second.entity.entity_id,
      documentId: "doc-1",
      role: "supplier",
    });
    expect(withRole.roles.filter((r) => r.entity_id === "ORG_001")).toHaveLength(2);
  });

  it("similar names without identifiers stay separate and raise needs_review", () => {
    const first = seedOrg('ООО "Ромашка"');
    const second = upsertEntity({
      registry: first.registry,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Ромашка"' },
      documentId: "doc-2",
    });
    expect(second.merged).toBe(false);
    expect(second.entity.entity_id).toBe("ORG_002");
    expect(second.conflict?.status).toBe("needs_review");
    expect(second.registry.entities.every((e) => e.status === "needs_review")).toBe(true);
  });

  it("same name with different INN never merges", () => {
    const first = seedOrg('ООО "Вектор"', "7701234567");
    const second = upsertEntity({
      registry: first.registry,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Вектор"', inn: "7809999999" },
    });
    expect(second.merged).toBe(false);
    expect(second.conflict?.reason).toBe("inn_mismatch");
  });

  it("address-only similarity never merges", () => {
    let reg = createEntityRegistry(SESSION);
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Первая"', address: "г. Москва, ул. Ленина, д. 1" },
    }).registry;
    const second = upsertEntity({
      registry: reg,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Вторая"', address: "город Москва, улица Ленина, дом 1" },
    });
    expect(second.merged).toBe(false);
    expect(second.entity.entity_id).toBe("ORG_002");
  });
});

describe("PR88 entity registry — roles", () => {
  it("a tax authority can never get the taxpayer role", () => {
    const seeded = upsertEntity({
      registry: createEntityRegistry(SESSION),
      candidate: { entity_type: "TAX_AUTHORITY", name: "ИФНС № 7" },
    });
    expect(() =>
      assignEntityRole({
        registry: seeded.registry,
        entityId: seeded.entity.entity_id,
        documentId: "doc-1",
        role: "taxpayer",
      }),
    ).toThrow(EntityRegistryError);
  });

  it("an organisation cannot claim the tax_authority role", () => {
    const seeded = seedOrg('ООО "Альфа"', "7701234567");
    expect(() =>
      assignEntityRole({
        registry: seeded.registry,
        entityId: seeded.entity.entity_id,
        documentId: null,
        role: "tax_authority",
      }),
    ).toThrow(EntityRegistryError);
  });
});

describe("PR88 entity registry — model-facing projection", () => {
  it("contains no canonical name/INN/OGRN/KPP/address", () => {
    let reg = createEntityRegistry(SESSION);
    reg = upsertEntity({
      registry: reg,
      candidate: {
        entity_type: "ORGANIZATION",
        name: 'ООО "Секрет"',
        inn: "7701234567",
        ogrn: "1027700132195",
        kpp: "770101001",
        address: "г. Москва, ул. Тайная, д. 5",
      },
      documentId: "doc-1",
      role: "taxpayer",
    }).registry;
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "TAX_AUTHORITY", name: "ИФНС № 7" },
      documentId: "doc-1",
      role: "tax_authority",
    }).registry;
    reg = addEntityRelation({
      registry: reg,
      from: "ORG_001",
      type: "HAS_COUNTERPARTY",
      to: "AUTH_001",
      documentId: "doc-1",
    });

    const payload = JSON.stringify(buildModelFacingEntityContext(reg));
    for (const secret of [
      "Секрет",
      "7701234567",
      "1027700132195",
      "770101001",
      "Тайная",
      "ИФНС",
    ]) {
      expect(payload).not.toContain(secret);
    }
    expect(payload).toContain("ORG_001");
    expect(payload).toContain("AUTH_001");
  });
});

describe("PR88 entity registry — redaction pipeline tokens", () => {
  it("rewrites per-document placeholders into stable registry tokens", () => {
    const doc1 = applyRegistryTokensToDocument({
      registry: createEntityRegistry(SESSION),
      documentId: "doc-1",
      redactedText: "Договор между [COMPANY_1] и [COMPANY_2].",
      entities: [
        { type: "COMPANY", original: 'ООО "Альфа"', placeholder: "[COMPANY_1]" },
        { type: "COMPANY", original: 'ООО "Бета"', placeholder: "[COMPANY_2]" },
      ],
    });
    expect(doc1.redacted_text).toBe("Договор между [ORG_001] и [ORG_002].");

    // Same subject re-detected in another document keeps its token only when
    // identity matching allows it (here: identical normalized name → conflict,
    // so it must NOT silently reuse ORG_001).
    const doc2 = applyRegistryTokensToDocument({
      registry: doc1.registry,
      documentId: "doc-2",
      redactedText: "Акт [COMPANY_1].",
      entities: [{ type: "COMPANY", original: 'ООО "Альфа"', placeholder: "[COMPANY_1]" }],
    });
    expect(doc2.redacted_text).toBe("Акт [ORG_003].");
    expect(doc2.registry.conflicts.length).toBeGreaterThan(0);
  });

  it("does not confuse [COMPANY_1] with [COMPANY_10]", () => {
    const entities = Array.from({ length: 10 }, (_, i) => ({
      type: "COMPANY",
      original: `ООО "К${i + 1}"`,
      placeholder: `[COMPANY_${i + 1}]`,
    }));
    const out = applyRegistryTokensToDocument({
      registry: createEntityRegistry(SESSION),
      documentId: "doc-1",
      redactedText: "[COMPANY_1] и [COMPANY_10]",
      entities,
    });
    expect(out.redacted_text).toBe("[ORG_001] и [ORG_010]");
  });
});

describe("PR88 entity registry — deterministic resolver", () => {
  function verifiedRegistry() {
    let reg = createEntityRegistry(SESSION);
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Альфа"', inn: "7701234567", status: "verified" },
    }).registry;
    reg = upsertEntity({
      registry: reg,
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Бета"', inn: "7809999999", status: "verified" },
    }).registry;
    return reg;
  }

  it("ORG_001 and ORG_002 resolve to their own values, never swapped", () => {
    const reg = verifiedRegistry();
    expect(resolveEntityTokenValue(reg, "[ORG_001]")).toBe('ООО "Альфа"');
    expect(resolveEntityTokenValue(reg, "[ORG_002]")).toBe('ООО "Бета"');
  });

  it("restores tokens inside answers", () => {
    const reg = verifiedRegistry();
    expect(
      restoreEntityTokensInAnswers({ claimant: "[ORG_001]", respondent: "[ORG_002]", note: "текст" }, reg),
    ).toEqual({ claimant: 'ООО "Альфа"', respondent: 'ООО "Бета"', note: "текст" });
  });

  it("fails closed for needs_review, unverified, unknown token and missing registry", () => {
    const reg = verifiedRegistry();
    const withReview = {
      ...reg,
      entities: reg.entities.map((e) =>
        e.entity_id === "ORG_002" ? { ...e, status: "needs_review" as const } : e,
      ),
    };
    expect(() => resolveEntityTokenValue(withReview, "[ORG_002]")).toThrow(EntityRegistryError);
    expect(() => resolveEntityTokenValue(reg, "[ORG_009]")).toThrow(EntityRegistryError);
    expect(() => resolveEntityTokenValue(null, "[ORG_001]")).toThrow(EntityRegistryError);

    const unverified = upsertEntity({
      registry: createEntityRegistry(SESSION),
      candidate: { entity_type: "ORGANIZATION", name: 'ООО "Гамма"' },
    }).registry;
    expect(() => resolveEntityTokenValue(unverified, "[ORG_001]")).toThrow(EntityRegistryError);
  });
});

describe("PR88 entity registry — legacy compatibility", () => {
  it("legacy sessions without a registry keep working", () => {
    expect(readEntityRegistry(undefined)).toBeNull();
    expect(readEntityRegistry(null)).toBeNull();
    expect(readEntityRegistry({ version: 0, entities: [] })).toBeNull();
    expect(restoreEntityTokensInAnswers({ a: "ООО Альфа" }, null)).toEqual({ a: "ООО Альфа" });
  });

  it("reads a persisted v1 registry back", () => {
    const reg = seedOrg('ООО "Альфа"', "7701234567").registry;
    const roundTripped = readEntityRegistry(JSON.parse(JSON.stringify(reg)));
    expect(roundTripped?.entities[0]?.entity_id).toBe("ORG_001");
  });
});
