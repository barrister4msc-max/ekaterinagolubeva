export type ConclusionLike = {
  conclusion_id?: unknown;
  statement?: unknown;
  provenance?: {
    use_in_generation?: boolean;
    needs_source?: boolean;
  } | null;
  [key: string]: unknown;
};

export type ConclusionSets = {
  generationConclusions: ConclusionLike[];
  blockedConclusions: ConclusionLike[];
};

export type GeneratorPromptInputs = ConclusionSets & {
  legalAnalysisForGeneration: Record<string, unknown> | null;
  documentContextForGeneration: Record<string, unknown> | null;
  workingStrategyForGeneration: Record<string, unknown> | null;
  blockedConclusionCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canUseConclusion(conclusion: ConclusionLike): boolean {
  return (
    conclusion?.provenance?.use_in_generation !== false &&
    conclusion?.provenance?.needs_source !== true
  );
}

function conclusionKey(conclusion: ConclusionLike): string {
  if (typeof conclusion.conclusion_id === "string" && conclusion.conclusion_id) {
    return `id:${conclusion.conclusion_id}`;
  }
  return `json:${JSON.stringify(conclusion)}`;
}

function uniqueConclusions(conclusions: ConclusionLike[]): ConclusionLike[] {
  const seen = new Set<string>();
  return conclusions.filter((conclusion) => {
    const key = conclusionKey(conclusion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Selects the Analyzer -> Generator conclusion contract.
 * Explicit Analyzer arrays are authoritative, but the generator still
 * validates provenance flags at its trust boundary. The legacy conclusions
 * fallback remains only for analysis runs created before those arrays existed.
 */
export function selectConclusionSets(
  legalAnalysis: Record<string, unknown> | null,
): ConclusionSets {
  const allConclusions = Array.isArray(legalAnalysis?.conclusions)
    ? (legalAnalysis.conclusions as ConclusionLike[]).filter(isRecord)
    : [];

  const explicitGeneration = Array.isArray(legalAnalysis?.generation_conclusions)
    ? (legalAnalysis.generation_conclusions as ConclusionLike[]).filter(isRecord)
    : null;
  const explicitBlocked = Array.isArray(legalAnalysis?.blocked_conclusions)
    ? (legalAnalysis.blocked_conclusions as ConclusionLike[]).filter(isRecord)
    : null;

  const generationCandidates = explicitGeneration ?? allConclusions;
  const explicitBlockedKeys = new Set((explicitBlocked ?? []).map(conclusionKey));
  const generationConclusions = generationCandidates.filter(
    (conclusion) => canUseConclusion(conclusion) && !explicitBlockedKeys.has(conclusionKey(conclusion)),
  );
  const rejectedGeneration = generationCandidates.filter((conclusion) => !canUseConclusion(conclusion));

  const blockedConclusions = uniqueConclusions([
    ...(explicitBlocked ?? allConclusions.filter((conclusion) => !canUseConclusion(conclusion))),
    ...rejectedGeneration,
  ]);

  return { generationConclusions, blockedConclusions };
}

function sanitizeTrustedSources(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source) => {
    if (!isRecord(source)) return [];
    const allowed = (
      source.actually_used_in_generation === true ||
      (source.actually_used_in_generation === undefined && source.use_in_generation === true)
    );
    if (!allowed) return [];
    return [{
      source_id: source.source_id,
      source_ref: source.source_ref,
      source_type: source.source_type,
      title: source.title,
      official_url: source.official_url,
      url: source.url,
      citation: source.citation,
      verification_status: source.verification_status,
      actuality_status: source.actuality_status,
      effective_from: source.effective_from,
      effective_to: source.effective_to,
      current_status: source.current_status,
      revision_date: source.revision_date,
    }];
  });
}

function sanitizeFactRecords(
  value: unknown,
  isBlockedText: (value: string) => boolean,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((fact) => {
    if (!isRecord(fact)) return [];
    const factId = typeof fact.fact_id === "string" ? fact.fact_id : "";
    const factText = typeof fact.fact_text === "string"
      ? fact.fact_text
      : typeof fact.text === "string"
        ? fact.text
        : "";
    return (factId || factText) && !isBlockedText(factText)
      ? [{
        fact_id: factId,
        fact_text: factText,
        claim_type: typeof fact.claim_type === "string" ? fact.claim_type : null,
      }]
      : [];
  });
}

function sanitizeEvidenceMatrix(
  value: unknown,
  isBlockedText: (value: string) => boolean,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const factText = typeof entry.fact_text === "string" ? entry.fact_text : "";
    if (isBlockedText(factText)) return [];
    return [{
      fact_id: typeof entry.fact_id === "string" ? entry.fact_id : "",
      fact_text: factText,
      documents_used: Array.isArray(entry.documents_used)
        ? entry.documents_used.filter((id): id is string => typeof id === "string")
        : [],
      used_in_conclusions: Array.isArray(entry.used_in_conclusions)
        ? entry.used_in_conclusions.filter((id): id is string => typeof id === "string")
        : [],
      document_relations: Array.isArray(entry.document_relations)
        ? entry.document_relations.flatMap((relation) =>
          isRecord(relation) &&
            typeof relation.document_id === "string" &&
            typeof relation.relation === "string"
            ? [{ document_id: relation.document_id, relation: relation.relation }]
            : []
        )
        : [],
      evidence_status: entry.evidence_status,
      evidence_strength: entry.evidence_strength,
    }];
  });
}

function blockedTextPredicate(blockedConclusions: ConclusionLike[]): (value: string) => boolean {
  const blockedStatements = blockedConclusions
    .map((conclusion) => typeof conclusion.statement === "string" ? conclusion.statement.trim() : "")
    .filter((statement) => statement.length >= 12);
  return (value) => blockedStatements.some(
    (statement) => {
      const candidate = value.trim();
      return candidate.length >= 12 &&
        (candidate.includes(statement) || statement.includes(candidate));
    },
  );
}

function sanitizeSourceWarnings(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((warning) => {
    if (!isRecord(warning)) return [];
    return [{
      source_ref: warning.source_ref,
      warning_type: warning.warning_type,
      superseded_by: warning.superseded_by,
      affected_conclusions: Array.isArray(warning.affected_conclusions)
        ? warning.affected_conclusions.filter((id): id is string => typeof id === "string")
        : [],
    }];
  });
}

function sanitizeDocumentRefs(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((document) => {
    if (!isRecord(document)) return [];
    return [{
      id: typeof document.id === "string" ? document.id : "",
      title: typeof document.title === "string" ? document.title : "",
    }];
  });
}

function sanitizeContextSection(
  value: unknown,
  isBlockedText: (value: string) => boolean,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return {
    items: Array.isArray(value.items)
      ? value.items.filter(
          (item): item is string => typeof item === "string" && !isBlockedText(item),
        )
      : [],
    derived_from_documents: sanitizeDocumentRefs(value.derived_from_documents),
    supporting_sources: [],
  };
}

function sanitizeFactEvidence(
  value: unknown,
  isBlockedText: (value: string) => boolean,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    return [{
      fact: typeof entry.fact === "string" && !isBlockedText(entry.fact) ? entry.fact : "",
      document_ids: Array.isArray(entry.document_ids)
        ? entry.document_ids.filter((id): id is string => typeof id === "string")
        : [],
      document_titles: Array.isArray(entry.document_titles)
        ? entry.document_titles.filter((title): title is string => typeof title === "string")
        : [],
    }];
  });
}

function sanitizeDocumentContext(
  value: unknown,
  blockedConclusions: ConclusionLike[],
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const isBlockedText = blockedTextPredicate(blockedConclusions);
  const facts = sanitizeContextSection(value.facts, isBlockedText);
  const missingEvidence = sanitizeContextSection(value.missing_evidence, isBlockedText);
  return {
    ...(facts ? { facts } : {}),
    ...(missingEvidence ? { missing_evidence: missingEvidence } : {}),
    fact_to_evidence_mapping: sanitizeFactEvidence(value.fact_to_evidence_mapping, isBlockedText),
    documents_used: sanitizeDocumentRefs(value.documents_used),
    document_context_quality: typeof value.document_context_quality === "number"
      ? value.document_context_quality
      : null,
    document_context_quality_breakdown: isRecord(value.document_context_quality_breakdown)
      ? Object.fromEntries(
          Object.entries(value.document_context_quality_breakdown).filter(
            ([, score]) => typeof score === "number",
          ),
        )
      : {},
  };
}

function sanitizeAiStrategyValue(
  value: unknown,
  isBlockedText: (value: string) => boolean,
): unknown {
  if (typeof value === "string") return isBlockedText(value) ? undefined : value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAiStrategyValue(item, isBlockedText))
      .filter((item) => item !== undefined);
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key === "blocked_arguments") return [];
      const sanitized = sanitizeAiStrategyValue(item, isBlockedText);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }),
  );
}

function sanitizeWorkingStrategy(
  value: unknown,
  blockedConclusions: ConclusionLike[],
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (value.strategy_source === "lawyer_override") return value;
  return sanitizeAiStrategyValue(
    value,
    blockedTextPredicate(blockedConclusions),
  ) as Record<string, unknown>;
}

/**
 * Builds the exact Legal Analysis and Document Context objects that may enter
 * the model prompt. Unsafe narrative fields are deliberately omitted because
 * they can contain conclusions rejected by the Analyzer quality gate.
 */
export function buildGeneratorPromptInputs(
  legalAnalysis: Record<string, unknown> | null,
  documentContext: unknown,
  workingStrategy?: unknown,
): GeneratorPromptInputs {
  const { generationConclusions, blockedConclusions } = selectConclusionSets(legalAnalysis);
  const isBlockedText = blockedTextPredicate(blockedConclusions);
  const legalAnalysisForGeneration = legalAnalysis
    ? {
        facts: Array.isArray(legalAnalysis.facts)
          ? legalAnalysis.facts.filter(
              (fact): fact is string => typeof fact === "string" && !isBlockedText(fact),
            )
          : [],
        facts_index: sanitizeFactRecords(legalAnalysis.facts_index, isBlockedText),
        generation_conclusions: generationConclusions,
        trusted_sources: sanitizeTrustedSources(legalAnalysis.trusted_sources),
        evidence_matrix: sanitizeEvidenceMatrix(legalAnalysis.evidence_matrix, isBlockedText),
        missing_evidence: Array.isArray(legalAnalysis.missing_evidence)
          ? legalAnalysis.missing_evidence.filter(
              (item): item is string => typeof item === "string" && !isBlockedText(item),
            )
          : [],
        source_warnings: sanitizeSourceWarnings(legalAnalysis.source_warnings),
        generation_allowed: isRecord(legalAnalysis.generation_allowed)
          ? {
              draft: legalAnalysis.generation_allowed.draft,
              final: legalAnalysis.generation_allowed.final,
            }
          : null,
        source_sufficiency: isRecord(legalAnalysis.source_sufficiency)
          ? { status: legalAnalysis.source_sufficiency.status }
          : null,
        template_code: legalAnalysis.template_code ?? null,
        target_document: legalAnalysis.target_document ?? null,
        process_stage: legalAnalysis.process_stage ?? null,
        document_intent: legalAnalysis.document_intent ?? null,
        analysis_version: legalAnalysis.analysis_version ?? null,
      }
    : null;

  return {
    legalAnalysisForGeneration,
    documentContextForGeneration: sanitizeDocumentContext(documentContext, blockedConclusions),
    workingStrategyForGeneration: sanitizeWorkingStrategy(workingStrategy, blockedConclusions),
    generationConclusions,
    blockedConclusions,
    blockedConclusionCount: blockedConclusions.length,
  };
}
