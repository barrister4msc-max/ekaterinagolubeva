import { supabase } from "@/integrations/supabase/client";

type Severity = "low" | "medium" | "high" | "critical";
type VerificationStatus =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "not_supported"
  | "insufficient_evidence";

type CaseDocument = {
  id: string;
  file_name: string | null;
  title?: string | null;
  ocr_text: string | null;
  metadata: Record<string, any> | null;
};

export type CaseEntity = {
  type:
    | "company"
    | "person"
    | "inn"
    | "kpp"
    | "ogrn"
    | "address"
    | "date"
    | "amount"
    | "document_number";
  value: string;
  context?: string;
  document_id: string;
  file_name?: string | null;
};

export type PartyPosition = {
  position_id: string;
  party_type:
    | "tax_authority"
    | "plaintiff"
    | "defendant"
    | "client"
    | "counterparty"
    | "court"
    | "administrative_body"
    | "unknown";
  source_document_id: string;
  source_file_name?: string | null;
  statement: string;
  quote: string;
  confidence: number;
};

export type PositionVerification = {
  position_id: string;
  verification_status: VerificationStatus;
  supporting_documents: Array<{
    document_id: string;
    file_name?: string | null;
    quote: string;
    strength: "low" | "medium" | "high";
  }>;
  contradicting_documents: Array<{
    document_id: string;
    file_name?: string | null;
    quote: string;
    contradiction_reason: string;
    strength: "low" | "medium" | "high";
  }>;
  missing_documents: Array<{
    document_type: string;
    why_needed: string;
    legal_relevance: string;
  }>;
  recommendation: string;
  severity: Severity;
};

export type CaseContradiction = {
  type:
    | "tax_authority_position_not_supported"
    | "tax_authority_position_contradicted"
    | "plaintiff_claim_not_supported"
    | "defendant_position_contradicted"
    | "client_answer_contradicted_by_documents"
    | "counterparty_statement_contradicted"
    | "fact_conflict"
    | "date_sequence_conflict"
    | "amount_mismatch"
    | "signer_mismatch"
    | "authority_conflict"
    | "company_name_mismatch"
    | "inn_mismatch"
    | "missing_payment_proof"
    | "missing_delivery_proof"
    | "missing_authority_document"
    | "missing_transport_documents"
    | "missing_warehouse_documents"
    | "missing_correspondence";
  severity: Severity;
  title: string;
  description: string;
  documents: Array<{
    document_id: string;
    file_name?: string | null;
    value?: string;
    quote?: string;
  }>;
  recommendation: string;
  needs_lawyer_review: boolean;
  review_status?: "pending" | "accepted" | "dismissed";
};

export type DocumentCaseIntelligence = {
  document_id: string;
  file_name?: string | null;
  source: "original_ocr_text" | "ocr_text";
  entities: CaseEntity[];
  party_positions: PartyPosition[];
  extracted_at: string;
  version: 1;
};

export type CaseIntelligenceMatrix = {
  version: 1;
  built_at: string;
  session_id: string;
  documents: Array<{
    document_id: string;
    file_name?: string | null;
    entities_count: number;
    positions_count: number;
  }>;
  entities_matrix: Record<string, CaseEntity[]>;
  party_position_matrix: PartyPosition[];
  position_verifications: PositionVerification[];
  logical_contradictions: CaseContradiction[];
  missing_evidence: CaseContradiction[];
  summary: {
    documents_total: number;
    entities_total: number;
    party_positions_total: number;
    contradictions_total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
};
function uniq<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function contextAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + length + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function pushMatches(
  entities: CaseEntity[],
  doc: CaseDocument,
  text: string,
  type: CaseEntity["type"],
  re: RegExp,
) {
  for (const match of text.matchAll(re)) {
    const value = match[0]?.trim();
    if (!value) continue;

    entities.push({
      type,
      value,
      context: contextAround(text, match.index ?? 0, value.length),
      document_id: doc.id,
      file_name: doc.file_name,
    });
  }
}

function extractEntities(doc: CaseDocument, sourceText: string): CaseEntity[] {
  const entities: CaseEntity[] = [];

  pushMatches(entities, doc, sourceText, "company", /(?:ООО|ОАО|АО|ПАО|ЗАО|НПАО|ИП)\s+[«"][^»"]{2,120}[»"]/gi);
  pushMatches(entities, doc, sourceText, "company", /(?:ООО|ОАО|АО|ПАО|ЗАО|НПАО)\s+[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z0-9\s\-]{2,100}/g);
  pushMatches(entities, doc, sourceText, "inn", /ИНН\s*\d{10,12}/gi);
  pushMatches(entities, doc, sourceText, "kpp", /КПП\s*\d{9}/gi);
  pushMatches(entities, doc, sourceText, "ogrn", /ОГРН(?:ИП)?\s*\d{13,15}/gi);
  pushMatches(entities, doc, sourceText, "person", /[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.(?=\s|$|[.,;:)\]])/g);
  pushMatches(entities, doc, sourceText, "person", /[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ][а-яё]{2,40}/g);
  pushMatches(entities, doc, sourceText, "date", /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g);
  pushMatches(entities, doc, sourceText, "date", /(?:за\s+|в\s+|по\s+|период\s+проверки:\s*)?\d{4}\s+год(?:а|у|ом)?/gi);
  pushMatches(entities, doc, sourceText, "amount", /\d[\d\s]{1,15}(?:,\d{2})?\s*(?:руб\.?|₽|RUB)/gi);
  pushMatches(
    entities,
    doc,
    sourceText,
    "document_number",
    /(?:договор|акт|счет|счёт|доверенность|решение|требование|приказ|упд|счет-фактура|счёт-фактура)\s*(?:№|N|#)\s*[А-ЯЁA-Z0-9\-/.]+/gi,
  );
  pushMatches(entities, doc, sourceText, "address", /(?:г\.|город|ул\.|улица|дом|д\.|офис|кв\.|помещение|склад)\s*[А-ЯЁA-Zа-яёa-z0-9\-/. ]{2,80}/gi);

  return uniq(entities, (e) => `${e.type}:${e.value}:${e.document_id}`);
}

function detectPartyType(text: string): PartyPosition["party_type"] {
  const lower = text.toLowerCase();

  if (/фнс|ифнс|налогов/.test(lower)) return "tax_authority";
  if (/истец|исков/.test(lower)) return "plaintiff";
  if (/ответчик|возражает/.test(lower)) return "defendant";
  if (/клиент|налогоплательщик|заявитель/.test(lower)) return "client";
  if (/контрагент|поставщик|покупатель/.test(lower)) return "counterparty";
  if (/суд|арбитраж/.test(lower)) return "court";

  return "unknown";
}

function extractPartyPositions(doc: CaseDocument, sourceText: string): PartyPosition[] {
  const positions: PartyPosition[] = [];
  const sentences = sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const markers =
    /(фнс|ифнс|налоговый орган|истец|ответчик|клиент|налогоплательщик|контрагент|поставщик|покупатель|суд)\s+(считает|указывает|утверждает|полагает|ссылается|возражает|настаивает|просит|требует)/i;

  for (const sentence of sentences) {
    if (!markers.test(sentence)) continue;

    positions.push({
      position_id: `pos_${doc.id}_${positions.length + 1}`,
      party_type: detectPartyType(sentence),
      source_document_id: doc.id,
      source_file_name: doc.file_name,
      statement: sentence,
      quote: sentence,
      confidence: 0.7,
    });
  }

  return positions;
}

function hasAnyDocLike(docs: CaseDocument[], patterns: RegExp[]): boolean {
  return docs.some((doc) => {
    const text = ((doc.metadata?.original_ocr_text as string | undefined) || doc.ocr_text || "").toLowerCase();
    return patterns.some((p) => p.test(text));
  });
}

function verifyPosition(
  position: PartyPosition,
  allDocs: CaseDocument[],
): PositionVerification {
  const statement = position.statement.toLowerCase();

  const missing: PositionVerification["missing_documents"] = [];
  const supporting: PositionVerification["supporting_documents"] = [];
  const contradicting: PositionVerification["contradicting_documents"] = [];

  if (/не имел.*ресурс|нет.*ресурс|склад|транспорт|персонал/.test(statement)) {
    const hasResourcesEvidence = hasAnyDocLike(allDocs, [
      /склад/i,
      /транспорт/i,
      /ттн/i,
      /товарно-транспорт/i,
      /персонал/i,
      /субподряд/i,
      /аренд/i,
    ]);

    if (!hasResourcesEvidence) {
      missing.push({
        document_type: "transport_warehouse_staff_documents",
        why_needed: "Позиция о наличии/отсутствии ресурсов требует подтверждения транспортными, складскими, кадровыми или субподрядными документами.",
        legal_relevance: "Влияет на реальность хозяйственной операции и довод о технической компании.",
      });
    }
  }

  if (/оплат|платеж|оплачен/.test(statement)) {
    const hasPayment = hasAnyDocLike(allDocs, [/платеж/i, /платёж/i, /поручени/i, /банк/i, /выписк/i]);
    if (!hasPayment) {
      missing.push({
        document_type: "payment_proof",
        why_needed: "Утверждение об оплате должно подтверждаться платежным поручением или банковской выпиской.",
        legal_relevance: "Влияет на доказанность реальности сделки и размера расходов.",
      });
    }
  }

  if (/доверенн|полномоч|подписант|подписал/.test(statement)) {
    const hasAuthority = hasAnyDocLike(allDocs, [/доверенн/i, /приказ/i, /полномоч/i]);
    if (!hasAuthority) {
      missing.push({
        document_type: "authority_document",
        why_needed: "Полномочия подписанта должны подтверждаться доверенностью, приказом или уставными документами.",
        legal_relevance: "Влияет на действительность документа и доказательственную силу.",
      });
    }
  }

  const status: VerificationStatus =
    missing.length > 0 ? "insufficient_evidence" : "partially_supported";

  return {
    position_id: position.position_id,
    verification_status: status,
    supporting_documents: supporting,
    contradicting_documents: contradicting,
    missing_documents: missing,
    recommendation:
      missing.length > 0
        ? "Запросить недостающие подтверждающие документы и отразить пробел в AI правовом анализе."
        : "Позиция требует ручной проверки юристом и сверки с доказательствами.",
    severity: missing.length > 0 ? "medium" : "low",
  };
}

function buildContradictions(
  entities: CaseEntity[],
  positions: PartyPosition[],
  verifications: PositionVerification[],
): {
  logical_contradictions: CaseContradiction[];
  missing_evidence: CaseContradiction[];
} {
  const logical: CaseContradiction[] = [];
  const missing: CaseContradiction[] = [];

  const inns = entities.filter((e) => e.type === "inn");
  const innValues = uniq(inns, (e) => e.value.replace(/\D/g, ""));
  if (innValues.length > 1) {
    logical.push({
      type: "inn_mismatch",
      severity: "high",
      title: "Несовпадение ИНН",
      description: "В документах обнаружены разные ИНН. Нужно проверить, относятся ли документы к одному контрагенту.",
      documents: innValues.map((e) => ({
        document_id: e.document_id,
        file_name: e.file_name,
        value: e.value,
        quote: e.context,
      })),
      recommendation: "Сверить контрагента по договору, счету, УПД, акту и платежным документам.",
      needs_lawyer_review: true,
      review_status: "pending",
    });
  }

  for (const verification of verifications) {
    if (verification.missing_documents.length === 0) continue;

    const position = positions.find((p) => p.position_id === verification.position_id);

    missing.push({
      type:
        position?.party_type === "tax_authority"
          ? "tax_authority_position_not_supported"
          : "missing_payment_proof",
      severity: verification.severity,
      title: "Позиция стороны требует дополнительных доказательств",
      description: position?.statement || "Позиция не подтверждена достаточными документами.",
      documents: position
        ? [
            {
              document_id: position.source_document_id,
              file_name: position.source_file_name,
              quote: position.quote,
            },
          ]
        : [],
      recommendation: verification.recommendation,
      needs_lawyer_review: true,
      review_status: "pending",
    });
  }

  return {
    logical_contradictions: logical,
    missing_evidence: missing,
  };
}

function groupEntities(entities: CaseEntity[]): Record<string, CaseEntity[]> {
  return entities.reduce<Record<string, CaseEntity[]>>((acc, entity) => {
    acc[entity.type] ||= [];
    acc[entity.type].push(entity);
    return acc;
  }, {});
}

function getOriginalText(doc: CaseDocument): { text: string; source: "original_ocr_text" | "ocr_text" } {
  const original = doc.metadata?.original_ocr_text;
  if (typeof original === "string" && original.trim()) {
    return { text: original.trim(), source: "original_ocr_text" };
  }

  return { text: (doc.ocr_text || "").trim(), source: "ocr_text" };
}

export function extractCaseIntelligenceFromDocument(doc: CaseDocument): DocumentCaseIntelligence {
  const { text, source } = getOriginalText(doc);

  return {
    document_id: doc.id,
    file_name: doc.file_name,
    source,
    entities: extractEntities(doc, text),
    party_positions: extractPartyPositions(doc, text),
    extracted_at: new Date().toISOString(),
    version: 1,
  };
}

export async function buildCaseIntelligenceForSession(
  sessionId: string,
): Promise<CaseIntelligenceMatrix> {
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, title, ocr_text, metadata")
    .eq("metadata->>intake_session_id", sessionId)
    .not("ocr_text", "is", null);

  if (error) throw error;

  const documents = ((docs || []) as CaseDocument[]).filter((d) => {
    const { text } = getOriginalText(d);
    return text.length > 0;
  });

  const perDocument = documents.map(extractCaseIntelligenceFromDocument);

  for (const item of perDocument) {
    const doc = documents.find((d) => d.id === item.document_id);
    const metadata = {
      ...(doc?.metadata || {}),
      case_intelligence: item,
      case_intelligence_status: "completed",
      case_intelligence_extracted_at: item.extracted_at,
    };

    await supabase.from("documents").update({ metadata }).eq("id", item.document_id);
  }

  const allEntities = perDocument.flatMap((d) => d.entities);
  const allPositions = perDocument.flatMap((d) => d.party_positions);
  const verifications = allPositions.map((position) => verifyPosition(position, documents));
  const { logical_contradictions, missing_evidence } = buildContradictions(
    allEntities,
    allPositions,
    verifications,
  );

  const summary = {
    documents_total: documents.length,
    entities_total: allEntities.length,
    party_positions_total: allPositions.length,
    contradictions_total: logical_contradictions.length + missing_evidence.length,
    critical: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "critical").length,
    high: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "high").length,
    medium: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "medium").length,
    low: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "low").length,
  };

  const matrix: CaseIntelligenceMatrix = {
    version: 1,
    built_at: new Date().toISOString(),
    session_id: sessionId,
    documents: perDocument.map((d) => ({
      document_id: d.document_id,
      file_name: d.file_name,
      entities_count: d.entities.length,
      positions_count: d.party_positions.length,
    })),
    entities_matrix: groupEntities(allEntities),
    party_position_matrix: allPositions,
    position_verifications: verifications,
    logical_contradictions,
    missing_evidence,
    summary,
  };

  const { data: sessionRows, error: sessionError } = await supabase
    .from("document_intake_sessions")
    .select("id, metadata")
    .eq("id", sessionId)
    .limit(1);

  if (sessionError) throw sessionError;

  const existingMetadata = (sessionRows?.[0]?.metadata || {}) as Record<string, any>;

  const { error: updateError } = await supabase
    .from("document_intake_sessions")
    .update({
      metadata: {
        ...existingMetadata,
        case_intelligence_matrix: matrix,
        case_intelligence_status: "completed",
        case_intelligence_built_at: matrix.built_at,
      },
    })
    .eq("id", sessionId);

  if (updateError) throw updateError;

  return matrix;
}

export async function loadCaseIntelligenceMatrix(
  sessionId: string,
): Promise<CaseIntelligenceMatrix | null> {
  const { data, error } = await supabase
    .from("document_intake_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;

  return ((data?.metadata as any)?.case_intelligence_matrix || null) as CaseIntelligenceMatrix | null;
}
