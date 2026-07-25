import type { CanonicalRelationsFeature } from "./constants.ts";

/** The complete, immutable feature-flag snapshot used by one operation. */
export type CanonicalRelationsFeatureFlags = Readonly<Record<CanonicalRelationsFeature, boolean>>;

/** JSON data accepted by canonical-relations boundaries. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CanonicalEntityKind =
  | "fact"
  | "document"
  | "legal_source"
  | "conclusion"
  | "strategy"
  | "challenge_issue";

export type CanonicalEntityId = string;

/**
 * PR-1 намеренно оставляет relation kind открытым.
 * Закрытый словарь будет добавлен позже строго из CDM-1/RRM-1.
 */
export type CanonicalRelationKind = string;

export interface CanonicalEntityRef<TKind extends CanonicalEntityKind = CanonicalEntityKind> {
  readonly kind: TKind;
  readonly id: CanonicalEntityId;
}

export interface CanonicalRelation<
  TRelationKind extends CanonicalRelationKind = CanonicalRelationKind,
> {
  readonly relation_id: string;
  readonly relation_kind: TRelationKind;
  readonly from: CanonicalEntityRef;
  readonly to: CanonicalEntityRef;
  readonly source_ref?: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CanonicalRelationSet<
  TRelationKind extends CanonicalRelationKind = CanonicalRelationKind,
> {
  readonly schema_version: string;
  readonly relations: readonly CanonicalRelation<TRelationKind>[];
}
