type AnyMatrix = Record<string, any> | null | undefined;

export function normalizeCaseDocuments(matrix: AnyMatrix): any[] {
  if (!matrix) return [];
  return Array.isArray(matrix.knowledge_documents)
    ? matrix.knowledge_documents
    : Array.isArray(matrix.documents)
      ? matrix.documents
      : [];
}

export function normalizeCaseFacts(matrix: AnyMatrix): any[] {
  if (!matrix) return [];
  return Array.isArray(matrix.facts) ? matrix.facts : [];
}

export function normalizeCaseEvidence(matrix: AnyMatrix): any[] {
  if (!matrix) return [];
  return Array.isArray(matrix.evidence_matrix) ? matrix.evidence_matrix : [];
}

export function normalizeCaseContradictions(matrix: AnyMatrix): any[] {
  if (!matrix) return [];
  return Array.isArray(matrix.contradictions)
    ? matrix.contradictions
    : Array.isArray(matrix.logical_contradictions)
      ? matrix.logical_contradictions
      : [];
}

export function normalizeMissingEvidence(matrix: AnyMatrix): any[] {
  if (!matrix) return [];
  return Array.isArray(matrix.missing_evidence_v2)
    ? matrix.missing_evidence_v2
    : Array.isArray(matrix.missing_evidence)
      ? matrix.missing_evidence
      : [];
}

export function normalizeGenerationContext(matrix: AnyMatrix): Record<string, any> {
  return matrix?.generation_context && typeof matrix.generation_context === "object"
    ? matrix.generation_context
    : {
        strongest_arguments: [],
        weakest_arguments: [],
        strongest_evidence: [],
        disputed_facts: [],
        recommended_structure: [],
        missing_before_generation: [],
        recommended_document_type: null,
        recommended_document_goal: null,
        recommended_document_strategy: null,
      };
}

export function normalizeReviewContext(matrix: AnyMatrix): Record<string, any> {
  return matrix?.review_context && typeof matrix.review_context === "object"
    ? matrix.review_context
    : {
        unsupported_claims: [],
        unsupported_articles: [],
        unsupported_dates: [],
        unsupported_amounts: [],
        unsupported_entities: [],
        unsupported_reasoning: [],
        unsupported_conclusions: [],
        unsupported_recommendations: [],
        hallucination_risk: "low",
      };
}
