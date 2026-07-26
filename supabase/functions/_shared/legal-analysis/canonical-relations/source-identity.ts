export interface SourceIdentityClaim {
  readonly sourceId: string;
}

export interface TrustedSourceIdentity {
  readonly source_ref: string;
}

export interface ResolvedSourceIdentity<T extends TrustedSourceIdentity = TrustedSourceIdentity> {
  readonly sourceId: string;
  readonly source: T;
}

export function resolveSourceIdentity<T extends TrustedSourceIdentity>(
  claim: SourceIdentityClaim,
  trustedSources: readonly T[],
): ResolvedSourceIdentity<T> | undefined {
  for (const source of trustedSources) {
    if (claim.sourceId === source.source_ref) {
      return { sourceId: claim.sourceId, source };
    }
  }

  return undefined;
}
