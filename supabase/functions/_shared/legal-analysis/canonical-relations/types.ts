/** An intentionally open type: consumers may introduce relation kinds independently. */
export type CanonicalRelationKind = string;

export type CanonicalEntityId = string;

export interface CanonicalEntity {
  readonly id: CanonicalEntityId;
  readonly type: string;
}

export interface CanonicalRelation {
  readonly sourceEntityId: CanonicalEntityId;
  readonly targetEntityId: CanonicalEntityId;
  readonly kind: CanonicalRelationKind;
}
