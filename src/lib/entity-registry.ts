/**
 * PR #88 — matter/session-scoped Entity Registry for redaction.
 *
 * Purpose: several organisations and related parties inside one matter must
 * never be mixed up between documents. The registry gives every subject one
 * stable, model-facing token (`[ORG_001]`, `[AUTH_001]`, `[PERSON_001]`) and
 * keeps the real values (name / ИНН / ОГРН / КПП / address) on the server side
 * of the existing privacy boundary (`document_intake_sessions.metadata`).
 *
 * Hard rules implemented here:
 *  - merge only on exact ИНН / ОГРН, or normalized name + a confirmed
 *    identifier (ИНН/ОГРН/КПП) that does not contradict;
 *  - name-only, address-only, fuzzy / embedding / LLM similarity NEVER merge —
 *    similar companies stay separate entities and raise a `needs_review`
 *    conflict (fail closed, no silent merge);
 *  - a tax authority can never receive the `taxpayer` role;
 *  - the model-facing projection contains no canonical name/ИНН/ОГРН/КПП/
 *    address or any other raw PII;
 *  - the final resolver is deterministic and only resolves `verified` or
 *    explicitly `lawyer_approved` entities.
 *
 * Pure functions only — no Supabase, no network. Persistence lives in
 * `document-intake-storage.ts`; legacy sessions without a registry keep
 * working unchanged (the reader returns `null`).
 */

import { normalizeCompanyName, normalizeDigits } from "./company-registry";

export const ENTITY_REGISTRY_VERSION = 1 as const;

export type EntityType = "ORGANIZATION" | "PERSON" | "TAX_AUTHORITY" | "BANK";

export type EntityStatus = "unverified" | "verified" | "lawyer_approved" | "needs_review";

export type EntityRole =
  | "taxpayer"
  | "counterparty"
  | "supplier"
  | "claimant"
  | "respondent"
  | "tax_authority"
  | "bank";

export type EntityRelationType = "HAS_COUNTERPARTY" | "ISSUED_DOCUMENT" | "PAID";

export type EntityCanonical = {
  name: string | null;
  inn: string | null;
  ogrn: string | null;
  kpp: string | null;
  address: string | null;
};

export type RegistryEntity = {
  entity_id: string;
  entity_type: EntityType;
  /** Server-side only. Never leaves through `buildModelFacingEntityContext`. */
  canonical: EntityCanonical;
  status: EntityStatus;
};

export type EntityMention = {
  entity_id: string;
  document_id: string;
  /** Intake field name or a text locator — never the raw quoted PII. */
  locator: string | null;
  /** Model-safe surface: the token, not the real value. */
  model_safe_mention: string;
};

export type EntityRoleAssignment = {
  entity_id: string;
  /** `null` = matter-scoped role, otherwise document-scoped. */
  document_id: string | null;
  role: EntityRole;
};

export type EntityRelation = {
  from_entity_id: string;
  type: EntityRelationType;
  to_entity_id: string;
  provenance: { document_id: string | null };
  confidence: number;
};

export type EntityConflict = {
  entity_ids: string[];
  reason: "similar_name" | "inn_mismatch" | "ogrn_mismatch";
  status: "needs_review";
};

export type EntityRegistry = {
  version: typeof ENTITY_REGISTRY_VERSION;
  session_id: string;
  entities: RegistryEntity[];
  mentions: EntityMention[];
  roles: EntityRoleAssignment[];
  relations: EntityRelation[];
  conflicts: EntityConflict[];
};

export class EntityRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityRegistryError";
  }
}

const TOKEN_PREFIX: Record<EntityType, string> = {
  ORGANIZATION: "ORG",
  PERSON: "PERSON",
  TAX_AUTHORITY: "AUTH",
  BANK: "BANK",
};

export function createEntityRegistry(sessionId: string): EntityRegistry {
  return {
    version: ENTITY_REGISTRY_VERSION,
    session_id: sessionId,
    entities: [],
    mentions: [],
    roles: [],
    relations: [],
    conflicts: [],
  };
}

/** Backward-compatible reader: unknown/legacy shapes read as "no registry". */
export function readEntityRegistry(value: unknown): EntityRegistry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EntityRegistry>;
  if (candidate.version !== ENTITY_REGISTRY_VERSION) return null;
  if (typeof candidate.session_id !== "string") return null;
  if (!Array.isArray(candidate.entities)) return null;
  return {
    version: ENTITY_REGISTRY_VERSION,
    session_id: candidate.session_id,
    entities: candidate.entities,
    mentions: Array.isArray(candidate.mentions) ? candidate.mentions : [],
    roles: Array.isArray(candidate.roles) ? candidate.roles : [],
    relations: Array.isArray(candidate.relations) ? candidate.relations : [],
    conflicts: Array.isArray(candidate.conflicts) ? candidate.conflicts : [],
  };
}

export function entityToken(entityId: string): string {
  return `[${entityId}]`;
}

export function isEntityToken(value: string): boolean {
  return /^\[(?:ORG|PERSON|AUTH|BANK)_\d{3,}\]$/.test(value.trim());
}

function nextEntityId(registry: EntityRegistry, type: EntityType): string {
  const prefix = TOKEN_PREFIX[type];
  let max = 0;
  for (const entity of registry.entities) {
    if (entity.entity_type !== type) continue;
    const n = Number(entity.entity_id.slice(prefix.length + 1));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type EntityCandidate = {
  entity_type: EntityType;
  name?: string | null;
  inn?: string | null;
  ogrn?: string | null;
  kpp?: string | null;
  address?: string | null;
  status?: EntityStatus;
};

type IdentityDecision =
  | { kind: "merge"; entity: RegistryEntity }
  | { kind: "new" }
  | { kind: "conflict"; with: RegistryEntity; reason: EntityConflict["reason"] };

/**
 * Identity resolution. Deterministic, no fuzzy matching of any kind.
 */
export function resolveEntityIdentity(
  registry: EntityRegistry,
  candidate: EntityCandidate,
): IdentityDecision {
  const inn = candidate.inn ? normalizeDigits(candidate.inn) : "";
  const ogrn = candidate.ogrn ? normalizeDigits(candidate.ogrn) : "";
  const kpp = candidate.kpp ? normalizeDigits(candidate.kpp) : "";
  const name = candidate.name ? normalizeCompanyName(candidate.name) : "";

  let nameOnlyMatch: RegistryEntity | null = null;

  for (const entity of registry.entities) {
    if (entity.entity_type !== candidate.entity_type) continue;
    const eInn = entity.canonical.inn ? normalizeDigits(entity.canonical.inn) : "";
    const eOgrn = entity.canonical.ogrn ? normalizeDigits(entity.canonical.ogrn) : "";
    const eKpp = entity.canonical.kpp ? normalizeDigits(entity.canonical.kpp) : "";
    const eName = entity.canonical.name ? normalizeCompanyName(entity.canonical.name) : "";

    // 1. Exact registry identifiers are sufficient grounds to merge.
    if (inn && eInn) {
      if (inn === eInn) return { kind: "merge", entity };
      if (name && eName && name === eName) {
        return { kind: "conflict", with: entity, reason: "inn_mismatch" };
      }
      continue;
    }
    if (ogrn && eOgrn) {
      if (ogrn === eOgrn) return { kind: "merge", entity };
      if (name && eName && name === eName) {
        return { kind: "conflict", with: entity, reason: "ogrn_mismatch" };
      }
      continue;
    }

    // 2. Normalized name + a confirmed identifier that the other side lacks
    //    but does not contradict.
    if (name && eName && name === eName) {
      const confirmed = Boolean(inn || ogrn || kpp);
      const otherConfirmed = Boolean(eInn || eOgrn || eKpp);
      if (confirmed && otherConfirmed) {
        if (kpp && eKpp && kpp !== eKpp) {
          return { kind: "conflict", with: entity, reason: "similar_name" };
        }
        return { kind: "merge", entity };
      }
      if (confirmed || otherConfirmed) return { kind: "merge", entity };
      // 3. Name alone — never merge.
      nameOnlyMatch = entity;
      continue;
    }
  }

  if (nameOnlyMatch) {
    return { kind: "conflict", with: nameOnlyMatch, reason: "similar_name" };
  }
  return { kind: "new" };
}

function mergeCanonical(target: EntityCanonical, candidate: EntityCandidate): EntityCanonical {
  return {
    name: target.name ?? clean(candidate.name),
    inn: target.inn ?? clean(candidate.inn),
    ogrn: target.ogrn ?? clean(candidate.ogrn),
    kpp: target.kpp ?? clean(candidate.kpp),
    address: target.address ?? clean(candidate.address),
  };
}

export type UpsertEntityResult = {
  registry: EntityRegistry;
  entity: RegistryEntity;
  merged: boolean;
  conflict: EntityConflict | null;
};

/** Register (or match) a subject. Never mutates the input registry. */
export function upsertEntity(params: {
  registry: EntityRegistry;
  candidate: EntityCandidate;
  documentId?: string | null;
  locator?: string | null;
  role?: EntityRole | null;
}): UpsertEntityResult {
  const registry: EntityRegistry = {
    ...params.registry,
    entities: [...params.registry.entities],
    mentions: [...params.registry.mentions],
    roles: [...params.registry.roles],
    relations: [...params.registry.relations],
    conflicts: [...params.registry.conflicts],
  };

  const decision = resolveEntityIdentity(registry, params.candidate);
  let entity: RegistryEntity;
  let merged = false;
  let conflict: EntityConflict | null = null;

  if (decision.kind === "merge") {
    const index = registry.entities.findIndex((e) => e.entity_id === decision.entity.entity_id);
    entity = {
      ...decision.entity,
      canonical: mergeCanonical(decision.entity.canonical, params.candidate),
      status:
        decision.entity.status === "needs_review"
          ? "needs_review"
          : (params.candidate.status ?? decision.entity.status),
    };
    registry.entities[index] = entity;
    merged = true;
  } else {
    entity = {
      entity_id: nextEntityId(registry, params.candidate.entity_type),
      entity_type: params.candidate.entity_type,
      canonical: {
        name: clean(params.candidate.name),
        inn: clean(params.candidate.inn),
        ogrn: clean(params.candidate.ogrn),
        kpp: clean(params.candidate.kpp),
        address: clean(params.candidate.address),
      },
      status:
        decision.kind === "conflict" ? "needs_review" : (params.candidate.status ?? "unverified"),
    };
    registry.entities.push(entity);

    if (decision.kind === "conflict") {
      conflict = {
        entity_ids: [decision.with.entity_id, entity.entity_id].sort(),
        reason: decision.reason,
        status: "needs_review",
      };
      registry.conflicts.push(conflict);
      const otherIndex = registry.entities.findIndex(
        (e) => e.entity_id === decision.with.entity_id,
      );
      if (otherIndex >= 0) {
        registry.entities[otherIndex] = {
          ...registry.entities[otherIndex],
          status: "needs_review",
        };
      }
    }
  }

  if (params.documentId) {
    const locator = clean(params.locator);
    const exists = registry.mentions.some(
      (m) =>
        m.entity_id === entity.entity_id &&
        m.document_id === params.documentId &&
        m.locator === locator,
    );
    if (!exists) {
      registry.mentions.push({
        entity_id: entity.entity_id,
        document_id: params.documentId,
        locator,
        model_safe_mention: entityToken(entity.entity_id),
      });
    }
  }

  let next = registry;
  if (params.role) {
    next = assignEntityRole({
      registry,
      entityId: entity.entity_id,
      documentId: params.documentId ?? null,
      role: params.role,
    });
  }

  return { registry: next, entity, merged, conflict };
}

/**
 * Document-scoped roles. A tax authority can never become a taxpayer.
 */
export function assignEntityRole(params: {
  registry: EntityRegistry;
  entityId: string;
  documentId: string | null;
  role: EntityRole;
}): EntityRegistry {
  const entity = params.registry.entities.find((e) => e.entity_id === params.entityId);
  if (!entity) {
    throw new EntityRegistryError(`Неизвестная сущность реестра: ${params.entityId}`);
  }
  if (entity.entity_type === "TAX_AUTHORITY" && params.role !== "tax_authority") {
    throw new EntityRegistryError(
      `Налоговый орган ${entity.entity_id} не может получить роль «${params.role}».`,
    );
  }
  if (entity.entity_type !== "TAX_AUTHORITY" && params.role === "tax_authority") {
    throw new EntityRegistryError(
      `Роль «tax_authority» доступна только сущностям типа TAX_AUTHORITY (${entity.entity_id}).`,
    );
  }

  const exists = params.registry.roles.some(
    (r) =>
      r.entity_id === params.entityId &&
      r.document_id === params.documentId &&
      r.role === params.role,
  );
  if (exists) return params.registry;

  return {
    ...params.registry,
    roles: [
      ...params.registry.roles,
      { entity_id: params.entityId, document_id: params.documentId, role: params.role },
    ],
  };
}

export function addEntityRelation(params: {
  registry: EntityRegistry;
  from: string;
  type: EntityRelationType;
  to: string;
  documentId: string | null;
  confidence?: number;
}): EntityRegistry {
  for (const id of [params.from, params.to]) {
    if (!params.registry.entities.some((e) => e.entity_id === id)) {
      throw new EntityRegistryError(`Неизвестная сущность реестра: ${id}`);
    }
  }
  return {
    ...params.registry,
    relations: [
      ...params.registry.relations,
      {
        from_entity_id: params.from,
        type: params.type,
        to_entity_id: params.to,
        provenance: { document_id: params.documentId },
        confidence: params.confidence ?? 1,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Model-facing projection — no canonical values, ever.
// ---------------------------------------------------------------------------

export type ModelFacingEntity = {
  entity_id: string;
  token: string;
  entity_type: EntityType;
  status: EntityStatus;
  roles: Array<{ document_id: string | null; role: EntityRole }>;
  relations: Array<{
    type: EntityRelationType;
    to: string;
    document_id: string | null;
    confidence: number;
  }>;
};

export type ModelFacingEntityContext = {
  version: typeof ENTITY_REGISTRY_VERSION;
  entities: ModelFacingEntity[];
  conflicts: EntityConflict[];
};

export function buildModelFacingEntityContext(
  registry: EntityRegistry,
): ModelFacingEntityContext {
  return {
    version: ENTITY_REGISTRY_VERSION,
    entities: registry.entities.map((entity) => ({
      entity_id: entity.entity_id,
      token: entityToken(entity.entity_id),
      entity_type: entity.entity_type,
      status: entity.status,
      roles: registry.roles
        .filter((r) => r.entity_id === entity.entity_id)
        .map((r) => ({ document_id: r.document_id, role: r.role })),
      relations: registry.relations
        .filter((r) => r.from_entity_id === entity.entity_id)
        .map((r) => ({
          type: r.type,
          to: r.to_entity_id,
          document_id: r.provenance.document_id,
          confidence: r.confidence,
        })),
    })),
    conflicts: registry.conflicts,
  };
}

// ---------------------------------------------------------------------------
// Document placeholders → stable registry tokens.
// ---------------------------------------------------------------------------

/**
 * Rewrite per-document placeholders (`[COMPANY_1]`, `[PERSON_2]`, …) produced by
 * `redactLegalDocument` into stable matter-scoped registry tokens. The detector
 * itself is untouched; this is a deterministic post-processing pass.
 */
export function applyRegistryTokensToDocument(params: {
  registry: EntityRegistry;
  documentId: string;
  redactedText: string;
  entities: Array<{ type: string; original: string; placeholder: string }>;
}): { registry: EntityRegistry; redacted_text: string; token_map: Record<string, string> } {
  let registry = params.registry;
  const tokenMap: Record<string, string> = {};

  for (const detected of params.entities) {
    const entityType = mapDetectedType(detected.type);
    if (!entityType) continue;
    if (tokenMap[detected.placeholder]) continue;

    const result = upsertEntity({
      registry,
      candidate: { entity_type: entityType, name: detected.original },
      documentId: params.documentId,
      locator: detected.placeholder,
    });
    registry = result.registry;
    tokenMap[detected.placeholder] = entityToken(result.entity.entity_id);
  }

  let text = params.redactedText;
  // Longest placeholder first so `[COMPANY_1]` never eats `[COMPANY_10]`.
  for (const placeholder of Object.keys(tokenMap).sort((a, b) => b.length - a.length)) {
    text = text.split(placeholder).join(tokenMap[placeholder]);
  }

  return { registry, redacted_text: text, token_map: tokenMap };
}

function mapDetectedType(type: string): EntityType | null {
  switch (type) {
    case "COMPANY":
    case "COUNTERPARTY":
      return "ORGANIZATION";
    case "PERSON":
      return "PERSON";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministic final resolver.
// ---------------------------------------------------------------------------

const RESOLVABLE_STATUSES: EntityStatus[] = ["verified", "lawyer_approved"];

/**
 * Resolve a registry token back to its canonical value for the FINAL document
 * only. Fail closed: unknown token, `needs_review`, unverified entity or a
 * missing canonical value aborts generation instead of substituting silently.
 */
export function resolveEntityTokenValue(
  registry: EntityRegistry | null | undefined,
  token: string,
): string {
  const trimmed = token.trim();
  if (!isEntityToken(trimmed)) {
    throw new EntityRegistryError(`Строка «${token}» не является токеном реестра сущностей.`);
  }
  if (!registry) {
    throw new EntityRegistryError(
      `Генерация остановлена: реестр сущностей отсутствует, токен ${trimmed} не восстановить.`,
    );
  }
  const entityId = trimmed.slice(1, -1);
  const entity = registry.entities.find((e) => e.entity_id === entityId);
  if (!entity) {
    throw new EntityRegistryError(
      `Генерация остановлена: токен ${trimmed} отсутствует в реестре сущностей.`,
    );
  }
  if (!RESOLVABLE_STATUSES.includes(entity.status)) {
    throw new EntityRegistryError(
      `Генерация остановлена: сущность ${entityId} требует проверки юриста (статус «${entity.status}»).`,
    );
  }
  const value = entity.canonical.name ?? entity.canonical.inn;
  if (!value) {
    throw new EntityRegistryError(
      `Генерация остановлена: для сущности ${entityId} нет исходного значения.`,
    );
  }
  return value;
}

/** Restore every registry token inside a flat answers object. Fail-closed. */
export function restoreEntityTokensInAnswers(
  answers: Record<string, unknown>,
  registry: EntityRegistry | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...answers };
  for (const [field, value] of Object.entries(answers)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!isEntityToken(trimmed)) continue;
    out[field] = resolveEntityTokenValue(registry, trimmed);
  }
  return out;
}
