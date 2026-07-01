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

// ============================================================
// v2: Case Knowledge Graph types
// ============================================================
export type IssueParticipantRole =
  | "tax_authority"
  | "taxpayer"
  | "plaintiff"
  | "defendant"
  | "applicant"
  | "respondent"
  | "seller"
  | "buyer"
  | "landlord"
  | "tenant"
  | "contractor"
  | "customer"
  | "creditor"
  | "debtor"
  | "bankruptcy_manager"
  | "notary"
  | "court"
  | "administrative_body"
  | "third_party"
  | "expert"
  | "client"
  | "counterparty"
  | "unknown";

export type CaseFact = {
  fact_id: string;
  fact_hash: string;
  title: string;
  text: string;
  source_documents: string[];
  entities: string[];
  confidence: number;
  verified: boolean;
  disputed: boolean;
  used_in_issues: string[];
};

export type CaseEvidenceItem = {
  evidence_id: string;
  fact_id: string | null;
  issue_id: string | null;
  document_id: string;
  file_name?: string | null;
  quote: string;
  strength: "low" | "medium" | "high";
  admissibility: "unknown" | "admissible" | "questionable" | "inadmissible";
  relevance: "low" | "medium" | "high";
  reliability: "low" | "medium" | "high";
};

export type IssueParticipant = {
  role: IssueParticipantRole;
  side: "pro" | "contra" | "neutral";
  claims: string[];
  arguments: string[];
  evidence: string[];
  attacks: string[];
  supports: string[];
};
export type CaseIssueType =
  | "reality_of_supply"
  | "debt_existence"
  | "contract_validity"
  | "signer_authority"
  | "deadline_compliance"
  | "good_faith_purchaser"
  | "damage_existence"
  | "claim_amount"
  | "tax_reconstruction"
  | "business_splitting"
  | "transaction_invalidity"
  | "contract_breach"
  | "missing_primary_documents"
  | "general_dispute";
export type CaseIssue = {
  issue_id: string;
  title: string;
  type: CaseIssueType;
  priority: Severity;
  status: "open" | "resolved" | "needs_review";
  participants: IssueParticipant[];
  supporting_facts: string[];
  contradicting_facts: string[];
  evidence: string[];
  missing_evidence: string[];
  contradictions: string[];
  legal_basis: string[];
  court_practice: string[];
  ai_assessment: string;
};

export type CaseContradictionV2 = {
  contradiction_id: string;
  type: string;
  severity: Severity;
  description: string;
  between: Array<{ document_id: string; file_name?: string | null; value?: string; quote?: string }>;
  affected_issues: string[];
  affected_facts: string[];
  recommendation: string;
  needs_lawyer_review: boolean;
  review_status: "pending" | "accepted" | "dismissed";
};

export type CaseMissingEvidenceV2 = {
  missing_id: string;
  issue_id: string | null;
  participant_role: IssueParticipantRole | null;
  required_document: string;
  importance: Severity;
  reason: string;
  effect: string;
  recommendation: string;
};

export type CaseTimelineEvent = {
  event_id: string;
  date: string;
  title: string;
  description: string;
  source_documents: string[];
  confidence: number;
};

export type CaseKnowledgeEntities = {
  persons: string[];
  companies: string[];
  authorities: string[];
  courts: string[];
  objects: string[];
  contracts: string[];
  tax_numbers: string[];
  addresses: string[];
  bank_accounts: string[];
};

export type CaseDocumentV2 = {
  document_id: string;
  file_name?: string | null;
  document_type: string | null;
  role: string | null;
  reliability: "low" | "medium" | "high";
  extracted_entities: string[];
  extracted_facts: string[];
  extracted_claims: string[];
  extracted_positions: string[];
  extracted_evidence: string[];
};

export type CaseGenerationContext = {
  strongest_arguments: string[];
  weakest_arguments: string[];
  strongest_evidence: string[];
  disputed_facts: string[];
  recommended_structure: string[];
  missing_before_generation: string[];
  recommended_document_type: string | null;
  recommended_document_goal: string | null;
  recommended_document_strategy: string | null;
  };

export type CaseReviewContext = {
  unsupported_claims: string[];
  unsupported_articles: string[];
  unsupported_dates: string[];
  unsupported_amounts: string[];
  unsupported_entities: string[];
  hallucination_risk: "low" | "medium" | "high";
  unsupported_reasoning: string[];
  unsupported_conclusions: string[];
  unsupported_recommendations: string[];
  };

export type CaseProcedural = {
  deadlines: string[];
  risks: string[];
  missed_terms: string[];
  procedural_actions: string[];
};

export type CaseLegalReasoning = {
  applicable_law: string[];
  conflicting_law: string[];
  court_practice: string[];
  tax_letters: string[];
  methodology: string[];
  ai_reasoning: string[];
};

export type CaseIntelligenceMatrix = {
  version: 1 | 2;
  built_at: string;
  session_id: string;
  documents: Array<{
    document_id: string;
    file_name?: string | null;
    entities_count: number;
    positions_count: number;
  }>;
  // v1 (kept for compatibility)
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
    // v2 additions (optional at read time)
    facts_total?: number;
    issues_total?: number;
    missing_evidence_total?: number;
  };
  // v2 (new — optional so existing consumers keep working)
  entities?: CaseKnowledgeEntities;
  knowledge_documents?: CaseDocumentV2[];
  facts?: CaseFact[];
  issues?: CaseIssue[];
  evidence_matrix?: CaseEvidenceItem[];
  contradictions?: CaseContradictionV2[];
  missing_evidence_v2?: CaseMissingEvidenceV2[];
  timeline?: CaseTimelineEvent[];
  procedural?: CaseProcedural;
  legal_reasoning?: CaseLegalReasoning;
  generation_context?: CaseGenerationContext;
  review_context?: CaseReviewContext;
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
    /(фнс|ифнс|налоговый орган|налогоплательщик|истец|ответчик|заявитель|административный орган|клиент|контрагент|поставщик|покупатель|арендодатель|арендатор|подрядчик|заказчик|кредитор|должник|управляющий|нотариус|суд|эксперт|третье лицо)\s+(считает|полагает|указывает|поясняет|утверждает|ссылается|возражает|не согласен|настаивает|просит|требует|установил|заявил|признал|отрицает|подтверждает)/i;

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

  // inn_mismatch: ONLY when the same company/role appears with different INNs,
  // OR the same INN is bound to different companies. Different INNs for
  // different counterparties (buyer vs seller) is NORMAL and not a contradiction.
  const companyToInns = new Map<string, Set<string>>();
  const innToCompanies = new Map<string, Set<string>>();
  for (const e of entities) {
    if (e.type !== "inn") continue;
    const innDigits = e.value.replace(/\D/g, "");
    if (!innDigits) continue;
    const ctx = (e.context || "").toLowerCase();
    // find nearest company mention in same context window
    const companyMatch = ctx.match(/(?:ооо|оао|ао|пао|зао|ип)\s+[«"]?[a-zа-яё0-9\-\s]{2,80}[»"]?/i);
    if (!companyMatch) continue;
    const companyKey = companyMatch[0].replace(/\s+/g, " ").trim().toLowerCase();
    if (!companyToInns.has(companyKey)) companyToInns.set(companyKey, new Set());
    companyToInns.get(companyKey)!.add(innDigits);
    if (!innToCompanies.has(innDigits)) innToCompanies.set(innDigits, new Set());
    innToCompanies.get(innDigits)!.add(companyKey);
  }
  const conflictingCompanies = Array.from(companyToInns.entries()).filter(([, s]) => s.size > 1);
  const conflictingInns = Array.from(innToCompanies.entries()).filter(([, s]) => s.size > 1);
  if (conflictingCompanies.length > 0 || conflictingInns.length > 0) {
    const affectedInns = new Set<string>([
      ...conflictingCompanies.flatMap(([, s]) => Array.from(s)),
      ...conflictingInns.map(([inn]) => inn),
    ]);
    logical.push({
      type: "inn_mismatch",
      severity: "high",
      title: "Несовпадение ИНН для одного участника",
      description:
        "Один и тот же участник указан с разными ИНН, либо один ИНН привязан к разным компаниям.",
      documents: entities
        .filter((e) => e.type === "inn" && affectedInns.has(e.value.replace(/\D/g, "")))
        .map((e) => ({
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

// ============================================================
// v2: Case Knowledge Graph builder
// ============================================================
const MISSING_EVIDENCE_MARKERS: Array<{ re: RegExp; required: string; effect: string }> = [
  { re: /транспортн(ых|ые)|ттн|товарно-транспорт/i, required: "Транспортные документы (ТТН)", effect: "Не подтверждена реальность перевозки товара." },
  { re: /складск(их|ие)|склад/i, required: "Складские документы", effect: "Не подтверждено движение товара на складе." },
  { re: /переписк/i, required: "Деловая переписка сторон", effect: "Не подтверждено согласование условий." },
  { re: /упд|универсальн(ый|ого) передаточн/i, required: "УПД", effect: "Не подтверждена приемка-передача." },
  { re: /счет-фактур|счёт-фактур/i, required: "Счета-фактуры", effect: "Не подтверждено право на вычет НДС." },
  { re: /договор(ы|ов)?\s+(не\s+представлен|отсутств|требуют)/i, required: "Договоры", effect: "Не подтверждены правоотношения сторон." },
  { re: /акт(ы)?\s+(не\s+представлен|отсутств|требуют)/i, required: "Акты выполненных работ / приема-передачи", effect: "Не подтверждено исполнение." },
  { re: /платежн(ых|ые)\s+поручен|банковск(ая|ой)\s+выписк/i, required: "Платежные поручения / банковская выписка", effect: "Не подтверждена оплата." },
  { re: /доверенност/i, required: "Доверенности", effect: "Не подтверждены полномочия подписанта." },
  { re: /приказ(ы)?\s+(о\s+назначен|о\s+полномоч)/i, required: "Приказы о назначении / полномочиях", effect: "Не подтверждены полномочия должностных лиц." },
  { re: /штатн(ых|ые)|штатное\s+расписан/i, required: "Штатные документы", effect: "Не подтверждено наличие персонала." },
  { re: /субподряд/i, required: "Договоры субподряда", effect: "Не подтверждено привлечение соисполнителей." },
];

const MISSING_TRIGGER_RE =
  /\b(требуются|необходимо\s+представить|отсутствует|отсутству[юе]т|не\s+приложен|не\s+подтверждена|не\s+представлен[ыо]?|нет\s+документов|требуется\s+доказать|нужн[ыа]\s+документ)/i;

function classifyEntities(entities: CaseEntity[]): CaseKnowledgeEntities {
  const persons = new Set<string>();
  const companies = new Set<string>();
  const authorities = new Set<string>();
  const courts = new Set<string>();
  const addresses = new Set<string>();
  const tax_numbers = new Set<string>();
  const contracts = new Set<string>();
  for (const e of entities) {
    const v = e.value.trim();
    if (!v) continue;
    if (e.type === "person") persons.add(v);
    else if (e.type === "company") {
      if (/фнс|ифнс|мифнс|министерств|росреестр|фас|фссп/i.test(v)) authorities.add(v);
      else if (/арбитражн|верховн|районн|городск|мировой|апелляционн|кассационн/i.test(v)) courts.add(v);
      else companies.add(v);
    } else if (e.type === "inn" || e.type === "kpp" || e.type === "ogrn") tax_numbers.add(v);
    else if (e.type === "address") addresses.add(v);
    else if (e.type === "document_number" && /договор/i.test(v)) contracts.add(v);
  }
  return {
    persons: Array.from(persons),
    companies: Array.from(companies),
    authorities: Array.from(authorities),
    courts: Array.from(courts),
    objects: [],
    contracts: Array.from(contracts),
    tax_numbers: Array.from(tax_numbers),
    addresses: Array.from(addresses),
    bank_accounts: [],
  };
}
function stableHash(input: string): string {
  let hash = 0;
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");

  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }

  return `h_${Math.abs(hash)}`;
}
function extractFactsFromDocs(
  perDocument: DocumentCaseIntelligence[],
  documents: CaseDocument[],
): CaseFact[] {
  const facts: CaseFact[] = [];
  let idx = 0;
  const factPatterns: Array<{ re: RegExp; title: string }> = [
    { re: /договор\s+(?:№\s*)?[\w\-\/.]+\s+(?:заключ[её]н|подпис[ае]н)/i, title: "Договор заключен" },
    { re: /сумм[аы]\s+(?:в\s+размере\s+)?[\d\s.,]+\s*(?:руб|₽)/i, title: "Указана сумма" },
    { re: /счет(?:-фактура)?\s*(?:№\s*)?[\w\-\/.]+\s+выставлен/i, title: "Счет выставлен" },
    { re: /оплата\s+(?:произведена|заявлена|перечислена)/i, title: "Заявлена оплата" },
    { re: /(?:ст\.?\s*54\.1|статья\s+54\.1)\s*нк/i, title: "Ссылка на ст. 54.1 НК РФ" },
    { re: /не\s+согласен|возража[ею]т|оспарива[ею]т/i, title: "Сторона выразила несогласие" },
    { re: /поставщик[ом]?\s+(?:указан|является)/i, title: "Указан поставщик" },
    { re: /покупател[ьяем]?\s+(?:указан|является)/i, title: "Указан покупатель" },
    { re: /доверенност[ьи]\s+(?:выдан|представлен)/i, title: "Доверенность выдана" },
    { re: /транспортировк[аи]\s+не\s+подтверждена/i, title: "Транспортировка не подтверждена" },
  ];

  for (const item of perDocument) {
    const doc = documents.find((d) => d.id === item.document_id);
    if (!doc) continue;
    const text = getOriginalText(doc).text;
    for (const p of factPatterns) {
      const m = text.match(p.re);
      if (!m) continue;
      const factText = contextAround(text, m.index ?? 0, m[0].length);
      idx += 1;
      facts.push({
        fact_id: `fact_${item.document_id}_${idx}`,
        title: p.title,
        text: factText,
        source_documents: [item.document_id],
        entities: item.entities.slice(0, 5).map((e) => e.value),
        confidence: 0.7,
        verified: false,
        disputed: /не\s+согласен|оспарива|возража/i.test(factText),
        used_in_issues: [],
      });
    }
  }
  return facts;
}

function extractMissingEvidenceV2(
  documents: CaseDocument[],
): CaseMissingEvidenceV2[] {
  const out: CaseMissingEvidenceV2[] = [];
  let counter = 0;
  for (const doc of documents) {
    const text = getOriginalText(doc).text;
    if (!MISSING_TRIGGER_RE.test(text)) continue;
    for (const m of MISSING_EVIDENCE_MARKERS) {
      if (!m.re.test(text)) continue;
      counter += 1;
      out.push({
        missing_id: `miss_${doc.id}_${counter}`,
        issue_id: null,
        participant_role: null,
        required_document: m.required,
        importance: "medium",
        reason: `В документе "${doc.file_name || doc.id}" встречается маркер запроса или отсутствия документа.`,
        effect: m.effect,
        recommendation: `Запросить: ${m.required}.`,
      });
    }
  }
  return uniq(out, (x) => `${x.required_document}`);
}

function mapPartyTypeToRole(pt: PartyPosition["party_type"]): IssueParticipantRole {
  return pt as IssueParticipantRole;
}

function buildIssuesFromPositions(
  positions: PartyPosition[],
  facts: CaseFact[],
  missing: CaseMissingEvidenceV2[],
): CaseIssue[] {
  if (positions.length === 0 && facts.length === 0) return [];

  const participantsMap = new Map<IssueParticipantRole, IssueParticipant>();
  for (const p of positions) {
    const role = mapPartyTypeToRole(p.party_type);
    if (!participantsMap.has(role)) {
      participantsMap.set(role, {
        role,
        side: role === "tax_authority" || role === "plaintiff" || role === "applicant" ? "pro" : "contra",
        claims: [],
        arguments: [],
        evidence: [],
        attacks: [],
        supports: [],
      });
    }
    participantsMap.get(role)!.claims.push(p.statement);
  }

  const issue: CaseIssue = {
    issue_id: "issue_main_1",
    title: "Основной спорный вопрос по делу",
    type: "general_dispute",
    priority: "medium",
    status: "open",
    participants: Array.from(participantsMap.values()),
    supporting_facts: facts.filter((f) => !f.disputed).map((f) => f.fact_id),
    contradicting_facts: facts.filter((f) => f.disputed).map((f) => f.fact_id),
    evidence: [],
    missing_evidence: missing.map((m) => m.missing_id),
    contradictions: [],
    legal_basis: [],
    court_practice: [],
    ai_assessment: "",
  };
  for (const f of facts) f.used_in_issues.push(issue.issue_id);
  for (const m of missing) m.issue_id = issue.issue_id;
  return [issue];
}

function buildEvidenceMatrix(
  facts: CaseFact[],
  perDocument: DocumentCaseIntelligence[],
): CaseEvidenceItem[] {
  const out: CaseEvidenceItem[] = [];
  let idx = 0;
  for (const f of facts) {
    for (const docId of f.source_documents) {
      const doc = perDocument.find((d) => d.document_id === docId);
      idx += 1;
      out.push({
        evidence_id: `ev_${idx}`,
        fact_id: f.fact_id,
        issue_id: f.used_in_issues[0] ?? null,
        document_id: docId,
        file_name: doc?.file_name ?? null,
        quote: f.text,
        strength: "medium",
        admissibility: "unknown",
        relevance: "medium",
        reliability: "medium",
      });
    }
  }
  return out;
}

function buildGenerationContext(
  facts: CaseFact[],
  evidence: CaseEvidenceItem[],
  missing: CaseMissingEvidenceV2[],
): CaseGenerationContext {
  const supportedFactIds = new Set(evidence.map((e) => e.fact_id).filter(Boolean) as string[]);
  const strongestFacts = facts.filter((f) => supportedFactIds.has(f.fact_id) && !f.disputed);
  const weakFacts = facts.filter((f) => !supportedFactIds.has(f.fact_id));
  return {
    strongest_arguments: strongestFacts.map((f) => f.title),
    weakest_arguments: weakFacts.map((f) => f.title),
    strongest_evidence: evidence.filter((e) => e.strength === "high").map((e) => e.evidence_id),
    disputed_facts: facts.filter((f) => f.disputed).map((f) => f.fact_id),
    recommended_structure: [
      "Фактические обстоятельства",
      "Правовая позиция",
      "Доказательства",
      "Возражения на позицию оппонента",
      "Требования",
    ],
    missing_before_generation: missing.map((m) => m.required_document),
  };
}

function buildReviewContext(facts: CaseFact[], evidence: CaseEvidenceItem[]): CaseReviewContext {
  const supported = new Set(evidence.map((e) => e.fact_id).filter(Boolean) as string[]);
  const unsupported = facts.filter((f) => !supported.has(f.fact_id));
  return {
    unsupported_claims: unsupported.map((f) => f.title),
    unsupported_articles: [],
    unsupported_dates: [],
    unsupported_amounts: [],
    unsupported_entities: [],
    hallucination_risk: unsupported.length > facts.length / 2 ? "high" : unsupported.length > 0 ? "medium" : "low",
  };
}

function buildTimeline(entities: CaseEntity[]): CaseTimelineEvent[] {
  const dates = entities.filter((e) => e.type === "date");
  return dates.slice(0, 50).map((e, i) => ({
    event_id: `evt_${i + 1}`,
    date: e.value,
    title: e.context?.slice(0, 80) ?? e.value,
    description: e.context ?? "",
    source_documents: [e.document_id],
    confidence: 0.5,
  }));
}

function buildDocumentsV2(
  perDocument: DocumentCaseIntelligence[],
  facts: CaseFact[],
): CaseDocumentV2[] {
  return perDocument.map((d) => ({
    document_id: d.document_id,
    file_name: d.file_name,
    document_type: null,
    role: null,
    reliability: "medium",
    extracted_entities: d.entities.map((e) => `${e.type}:${e.value}`),
    extracted_facts: facts.filter((f) => f.source_documents.includes(d.document_id)).map((f) => f.fact_id),
    extracted_claims: d.party_positions.map((p) => p.statement),
    extracted_positions: d.party_positions.map((p) => p.position_id),
    extracted_evidence: [],
  }));
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

  // v2 graph
  const entitiesV2 = classifyEntities(allEntities);
  const facts = extractFactsFromDocs(perDocument, documents);
  const missingV2 = extractMissingEvidenceV2(documents);
  const issues = buildIssuesFromPositions(allPositions, facts, missingV2);
  const evidenceMatrix = buildEvidenceMatrix(facts, perDocument);
  const contradictionsV2: CaseContradictionV2[] = logical_contradictions.map((c, i) => ({
    contradiction_id: `contra_${i + 1}`,
    type: c.type,
    severity: c.severity,
    description: c.description,
    between: c.documents,
    affected_issues: issues.map((x) => x.issue_id),
    affected_facts: [],
    recommendation: c.recommendation,
    needs_lawyer_review: c.needs_lawyer_review,
    review_status: c.review_status ?? "pending",
  }));
  const timeline = buildTimeline(allEntities);
  const documentsV2 = buildDocumentsV2(perDocument, facts);
  const generationContext = buildGenerationContext(facts, evidenceMatrix, missingV2);
  const reviewContext = buildReviewContext(facts, evidenceMatrix);

  const summary = {
    documents_total: documents.length,
    entities_total: allEntities.length,
    party_positions_total: allPositions.length,
    contradictions_total: logical_contradictions.length + missing_evidence.length,
    critical: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "critical").length,
    high: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "high").length,
    medium: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "medium").length,
    low: [...logical_contradictions, ...missing_evidence].filter((x) => x.severity === "low").length,
    facts_total: facts.length,
    issues_total: issues.length,
    missing_evidence_total: missingV2.length,
  };

  const matrix: CaseIntelligenceMatrix = {
    version: 2,
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
    entities: entitiesV2,
    documents_v2: documentsV2,
    facts,
    issues,
    evidence_matrix: evidenceMatrix,
    contradictions: contradictionsV2,
    missing_evidence_v2: missingV2,
    timeline,
    procedural: { deadlines: [], risks: [], missed_terms: [], procedural_actions: [] },
    legal_reasoning: {
      applicable_law: [],
      conflicting_law: [],
      court_practice: [],
      tax_letters: [],
      methodology: [],
      ai_reasoning: [],
    },
    generation_context: generationContext,
    review_context: reviewContext,
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
