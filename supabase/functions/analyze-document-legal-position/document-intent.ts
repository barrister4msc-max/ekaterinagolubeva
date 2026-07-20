// P0-A: Deterministic Document Intent resolver.
// Small extensible mapping by template_code. NOT an AI layer.
// Unknown templates get a safe fallback (nulls) — never throw.

export type DocumentIntent = {
  target_document: string | null;
  process_stage: string | null;
  document_intent: string | null;
};

const REGISTRY: Record<string, DocumentIntent> = {
  tax_ufns_appeal: {
    target_document: "Жалоба в УФНС",
    process_stage: "appeal",
    document_intent:
      "Обжалование решения налогового органа в вышестоящий налоговый орган",
  },
};

export function resolveDocumentIntent(
  templateCode: string | null | undefined,
  templateTitle?: string | null,
): DocumentIntent {
  if (templateCode && REGISTRY[templateCode]) return REGISTRY[templateCode];
  return {
    target_document: templateTitle ?? null,
    process_stage: null,
    document_intent: null,
  };
}
