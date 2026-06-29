/**
 * Enterprise Legal Redaction (Phase 2).
 *
 * Goal: produce a redacted_text safe to load into Knowledge Base / RAG /
 * embeddings. Performs:
 *   1) entity extraction (extended set: PERSON / COMPANY / COUNTERPARTY /
 *      ADDRESS / EMAIL / PHONE / PASSPORT / BANK_DETAILS / DATE /
 *      DOCUMENT_NUMBER / CADASTRAL / CASE_NUMBER / VIN / LICENSE_PLATE /
 *      QR / SIGNATURE / STAMP),
 *   2) consistent replacement (same surface form → same placeholder),
 *   3) public bodies whitelist (FNS, courts, Rosreestr, …),
 *   4) structure preservation (no reflow, no normalisation),
 *   5) self-review pass scanning leftover identifiers,
 *   6) coverage statistics + redaction_quality flag.
 *
 * Pure functions — no DB / no network. Storage layer lives in
 * `document-redaction.ts`. No new tables, no edge functions.
 */

export const LEGAL_REDACTION_VERSION = 2;

export type LegalEntityType =
  | "PERSON"
  | "COMPANY"
  | "COUNTERPARTY"
  | "ADDRESS"
  | "EMAIL"
  | "PHONE"
  | "PASSPORT"
  | "BANK_DETAILS"
  | "DATE"
  | "DOCUMENT_NUMBER"
  | "CADASTRAL"
  | "CASE_NUMBER"
  | "VIN"
  | "LICENSE_PLATE"
  | "QR"
  | "SIGNATURE"
  | "STAMP";

export type LegalEntity = {
  type: LegalEntityType;
  original: string;
  placeholder: string;
};

export type RemainingEntity = {
  type: LegalEntityType;
  text: string;
  reason: string;
  severity: "low" | "medium" | "high";
};

export type RedactionStats = {
  detected_total: number;
  replaced_total: number;
  remaining_total: number;
  coverage_percent: number;
  by_type: Record<LegalEntityType, { detected: number; replaced: number; remaining: number }>;
};

export type RedactionQuality = "excellent" | "warning" | "unsafe";

export type LegalRedactionResult = {
  redacted_text: string;
  entities: LegalEntity[];
  remaining_entities: RemainingEntity[];
  stats: RedactionStats;
  quality: RedactionQuality;
  version: number;
};

// ---------------------------------------------------------------------------
// Public-body whitelist — these MUST NOT be redacted as companies.
// ---------------------------------------------------------------------------

const GOV_WHITELIST_PATTERNS: RegExp[] = [
  /\b(?:ФНС|УФНС|ИФНС|МИФНС|МРИ\s*ФНС)\b[^,.;\n]{0,80}/gi,
  /\bРосреестр\b[^,.;\n]{0,80}/gi,
  /\bФССП\b[^,.;\n]{0,80}/gi,
  /\b(?:МВД|УМВД|ГУВД|ОВД|ГИБДД)\b[^,.;\n]{0,80}/gi,
  /\bПрокуратур\w+\b[^,.;\n]{0,80}/gi,
  /\b(?:СК\s*РФ|Следственн\w+\s+комитет\w*)\b[^,.;\n]{0,80}/gi,
  /\bМинюст\w*\b[^,.;\n]{0,80}/gi,
  /\b(?:Верховн\w+|Конституционн\w+|Арбитражн\w+|Апелляционн\w+|Кассационн\w+|Городск\w+|Районн\w+|Мировой|Областн\w+|Краев\w+)\s+суд\w*\b/gi,
  /\bсуд\s+(?:г\.?\s*[А-ЯЁ][а-яё-]+|[А-ЯЁ][а-яё]+(?:ого|ской|кого)\s+района)\b/gi,
  /\bЦБ\s*РФ\b|\bБанк\s+России\b/gi,
  /\bПФР\b|\bПенсионный\s+фонд\b/gi,
  /\bФСС\b|\bФонд\s+социального\s+страхования\b/gi,
  /\bФОМС\b|\bФедеральн\w+\s+фонд\s+ОМС\b/gi,
  /\bРоспотребнадзор\b/gi,
  /\bРоструд\b/gi,
];

function buildGovMask(text: string): { masked: string; placeholders: Map<string, string> } {
  const placeholders = new Map<string, string>();
  let masked = text;
  let i = 0;
  for (const re of GOV_WHITELIST_PATTERNS) {
    masked = masked.replace(re, (m) => {
      const key = `\u0001GOV${i++}\u0001`;
      placeholders.set(key, m);
      return key;
    });
  }
  return { masked, placeholders };
}

function unmaskGov(text: string, placeholders: Map<string, string>): string {
  let out = text;
  for (const [k, v] of placeholders) out = out.split(k).join(v);
  return out;
}

// ---------------------------------------------------------------------------
// Entity patterns — order matters (longest / most specific first).
// ---------------------------------------------------------------------------

type Pattern = { type: LegalEntityType; re: RegExp; reason: string };

const PATTERNS: Pattern[] = [
  // QR / штрихкоды — упоминания
  { type: "QR", re: /\b(?:QR[-\s]?код|штрих[-\s]?код|штрихкод)[^\n]{0,40}/gi, reason: "qr/barcode" },

  // Подписи / печати — текстовые маркеры
  {
    type: "SIGNATURE",
    re: /(?:\/подпись\/|\(подпись\)|подписан(?:о|а|и)?\s+[А-ЯЁ][а-яё]+|собственноручн\w+\s+подпись)/gi,
    reason: "signature marker",
  },
  { type: "STAMP", re: /(?:М\.?\s*П\.?|\(печать\)|оттиск\s+печати|гербов\w+\s+печать)/gi, reason: "stamp marker" },

  // Email / телефон
  { type: "EMAIL", re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, reason: "email" },
  {
    type: "PHONE",
    re: /(?:\+7|\b8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
    reason: "phone",
  },

  // Паспорт — расширенный блок (серия+номер, кем выдан, код подразделения)
  {
    type: "PASSPORT",
    re: /паспорт\w*\s*(?:гражданина\s+РФ\s*)?(?:серия\s*)?\d{2}\s?\d{2}\s*(?:№\s*)?\d{6}(?:[^\n]{0,200}?код\s+подразделения\s*\d{3}-\d{3})?/gi,
    reason: "passport block",
  },
  { type: "PASSPORT", re: /\bсерия\s+\d{2}\s?\d{2}\s+(?:№\s*)?\d{6}\b/gi, reason: "passport" },
  { type: "PASSPORT", re: /\b\d{2}\s?\d{2}\s?\d{6}\b/g, reason: "passport-like" },
  { type: "PASSPORT", re: /\bкод\s+подразделения[:\s]*\d{3}-\d{3}\b/gi, reason: "issuer code" },

  // Банковские реквизиты
  { type: "BANK_DETAILS", re: /\bИНН[:\s]*\d{10,12}\b/gi, reason: "ИНН" },
  { type: "BANK_DETAILS", re: /\bКПП[:\s]*\d{9}\b/gi, reason: "КПП" },
  { type: "BANK_DETAILS", re: /\bОГРН(?:ИП)?[:\s]*\d{13,15}\b/gi, reason: "ОГРН" },
  { type: "BANK_DETAILS", re: /\bБИК[:\s]*\d{9}\b/gi, reason: "БИК" },
  { type: "BANK_DETAILS", re: /\b(?:р\/?с|к\/?с|расч[её]тн\w*\s+сч[её]т|корр?\.?\s*сч[её]т)[:\s№]*\d{20}\b/gi, reason: "счёт" },
  { type: "BANK_DETAILS", re: /\bIBAN[:\s]*[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, reason: "IBAN" },
  { type: "BANK_DETAILS", re: /\bSWIFT[:\s]*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2,5}\b/gi, reason: "SWIFT" },
  { type: "BANK_DETAILS", re: /\bСНИЛС[:\s]*\d{3}-\d{3}-\d{3}\s?\d{2}\b/gi, reason: "СНИЛС" },
  { type: "BANK_DETAILS", re: /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, reason: "СНИЛС-like" },

  // Кадастр / VIN / госномер
  { type: "CADASTRAL", re: /\b\d{2}:\d{2}:\d{6,7}:\d{1,5}\b/g, reason: "cadastral" },
  { type: "VIN", re: /\bVIN[:\s]*[A-HJ-NPR-Z0-9]{17}\b/gi, reason: "VIN" },
  { type: "VIN", re: /\b[A-HJ-NPR-Z0-9]{17}\b/g, reason: "VIN-like" },
  {
    type: "LICENSE_PLATE",
    re: /\b[АВЕКМНОРСТУХABEKMHOPCTYX]\s?\d{3}\s?[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\s?\d{2,3}\b/g,
    reason: "license plate",
  },

  // Номера дел
  {
    type: "CASE_NUMBER",
    re: /\b(?:дело|№\s*дела)\s*№?\s*[A-ZА-Я]?\d{1,3}[-/]\d{1,7}\/\d{2,4}\b/gi,
    reason: "case number",
  },
  { type: "CASE_NUMBER", re: /\bА\d{2}[-/]\d{1,7}\/\d{4}\b/g, reason: "арбитражное дело" },

  // Номера документов
  {
    type: "DOCUMENT_NUMBER",
    re: /(?:договор\w*|контракт\w*|соглашен\w+|акт\w*|счет(?:-фактур\w+)?|счёт(?:-фактур\w+)?|УПД|доверенност\w+|приказ\w*|постановлен\w+|определен\w+|решен\w+|заявлен\w+|претензи\w+|уведомлен\w+)\s*(?:№|N|#)\s*[A-ZА-Я0-9][A-ZА-Я0-9\-\/.]*/gi,
    reason: "doc number",
  },

  // Адреса (расширено — улица, дом, корпус, офис, квартира, район, область, кадастровая привязка адреса)
  {
    type: "ADDRESS",
    re: /(?:\d{6}\s*,?\s*)?(?:Российская\s+Федерация\s*,?\s*)?(?:г\.?\s?[А-ЯЁ][а-яё-]+|[А-ЯЁ][а-яё]+\s+(?:область|край|республика|АО)|обл\.?\s?[А-ЯЁ][а-яё-]+)(?:[,;]\s*(?:р-?н|район|г\.?|город|пос\.?|посёлок|с\.?|село|д\.?|деревня|мкр\.?|микрорайон|ул\.?|улица|пр-?т\.?|проспект|пер\.?|переулок|шоссе|ш\.?|наб\.?|набережная|пл\.?|площадь|б-?р\.?|бульвар|дом|корп\.?|корпус|стр\.?|строение|кв\.?|квартира|оф\.?|офис|пом\.?|помещение|склад|объект)\s?[А-ЯЁа-яё0-9.\-/ ]+)+/g,
    reason: "address",
  },

  // ФИО — роль + ФИО
  {
    type: "PERSON",
    re: /(?:директор\w*|ген\.?\s*директор\w*|управляющ\w+|учредител\w+|участник\w*|представител\w+|нотариус\w*|эксперт\w*|свидетел\w+|истец|ответчик\w*|подписант\w*|поверенн\w+|адвокат\w*)\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./gi,
    reason: "role+ФИО",
  },
  {
    type: "PERSON",
    re: /(?:директор\w*|ген\.?\s*директор\w*|управляющ\w+|учредител\w+|участник\w*|представител\w+|нотариус\w*|эксперт\w*|свидетел\w+|подписант\w*|поверенн\w+|адвокат\w*)\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/g,
    reason: "role+ФИО full",
  },
  // ФИО полное
  {
    type: "PERSON",
    re: /\b[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\s+[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)\s+[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)?\b/g,
    reason: "ФИО",
  },
  {
    type: "PERSON",
    re: /\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)\s+[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\b/g,
    reason: "Имя Отчество Фамилия",
  },
  // ФИО + инициалы
  {
    type: "PERSON",
    re: /\b[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g,
    reason: "Фамилия И.О.",
  },
  {
    type: "PERSON",
    re: /\b[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\b/g,
    reason: "И.О. Фамилия",
  },
    // ФИО — обычный формат Фамилия Имя Отчество без морфологических ограничений
  {
    type: "PERSON",
    re: /\b[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ][а-яё]{2,40}\b/g,
    reason: "Фамилия Имя Отчество simple",
  },
  {
    type: "PERSON",
    re: /\b[А-ЯЁ][а-яё]{2,40}\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g,
    reason: "Фамилия И.О. simple",
  },  
  // Юридические лица: ООО/АО/...
  {
    type: "COMPANY",
    re: /(?:ООО|ОАО|АО|ПАО|ЗАО|НПАО|ИП|НКО|ФГУП|МУП|ГУП|ТСЖ|ЖСК|СНТ|АНО|Фонд|Союз|Ассоциация|Компания|Корпорация)\s+["«][^"»\n]{1,120}["»]/g,
    reason: "company",
  },
  {
    type: "COMPANY",
    re: /["«][^"»\n]{1,120}["»]\s*(?:ООО|ОАО|АО|ПАО|ЗАО)/g,
    reason: "company suffix",
  },
  // ИП ФИО
  {
    type: "COMPANY",
    re: /\bИП\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g,
    reason: "ИП",
  },

  // Даты
  { type: "DATE", re: /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g, reason: "date" },
  {
    type: "DATE",
    re: /\b\d{1,2}\s+(?:январ[яь]|феврал[яь]|март[а]?|апрел[яь]|ма[йя]|июн[яь]|июл[яь]|август[а]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+\d{4}\s*(?:г\.?|года)?/gi,
    reason: "date long",
  },
    {
    type: "DATE",
    re: /\b(?:за\s+|в\s+|по\s+|период\s+проверки:\s*)?\d{4}\s+год(?:а|у|ом)?\b/gi,
    reason: "year period",
  },
];

// Types treated as critical when leftover in self-review.
const CRITICAL_TYPES = new Set<LegalEntityType>([
  "PERSON",
  "PASSPORT",
  "BANK_DETAILS",
  "EMAIL",
  "PHONE",
  "VIN",
  "LICENSE_PLATE",
  "CADASTRAL",
]);
function findRiskMarkers(text: string): RemainingEntity[] {
  const markers: Array<{ type: LegalEntityType; re: RegExp; reason: string }> = [
    { type: "COMPANY", re: /\b(?:ООО|ОАО|АО|ПАО|ЗАО|НПАО|ИП)\b/iu, reason: "company marker" },
    { type: "BANK_DETAILS", re: /\b(?:ИНН|КПП|ОГРН|ОГРНИП|БИК|р\/с|к\/с)\b/iu, reason: "bank/details marker" },
    { type: "DOCUMENT_NUMBER", re: /\b(?:договор|акт|счет|счёт|доверенность|решение|требование|приказ|упд|счет-фактура|счёт-фактура)\s*(?:№|N|#)?/iu, reason: "document marker" },
    { type: "DATE", re: /\b(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{4}\s+год)\b/iu, reason: "date marker" },
    { type: "PERSON", re: /\b(?:ФИО|представитель|директор|подписант|в лице|действующ\w+\s+на\s+основании)\b/iu, reason: "person marker" },
    { type: "ADDRESS", re: /\b(?:г\.|ул\.|улица|дом|д\.|офис|кв\.|помещение|склад)\b/iu, reason: "address marker" },
    { type: "EMAIL", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu, reason: "email marker" },
    { type: "PHONE", re: /(?:\+7|\b8)[\s\-(]*\d{3}/u, reason: "phone marker" },
  ];

  const found: RemainingEntity[] = [];

  for (const marker of markers) {
    if (marker.re.test(text)) {
      found.push({
        type: marker.type,
        text: marker.reason,
        reason: `Risk marker remains: ${marker.reason}`,
        severity: "high",
      });
    }
  }

  return found;
}
// ---------------------------------------------------------------------------
// Redaction core.
// ---------------------------------------------------------------------------

function emptyByType(): RedactionStats["by_type"] {
  const all: LegalEntityType[] = [
    "PERSON",
    "COMPANY",
    "COUNTERPARTY",
    "ADDRESS",
    "EMAIL",
    "PHONE",
    "PASSPORT",
    "BANK_DETAILS",
    "DATE",
    "DOCUMENT_NUMBER",
    "CADASTRAL",
    "CASE_NUMBER",
    "VIN",
    "LICENSE_PLATE",
    "QR",
    "SIGNATURE",
    "STAMP",
  ];
  const r = {} as RedactionStats["by_type"];
  for (const t of all) r[t] = { detected: 0, replaced: 0, remaining: 0 };
  return r;
}

export function redactLegalDocument(input: string): LegalRedactionResult {
  const stats: RedactionStats = {
    detected_total: 0,
    replaced_total: 0,
    remaining_total: 0,
    coverage_percent: 100,
    by_type: emptyByType(),
  };
  const entities: LegalEntity[] = [];

  if (!input || input.trim().length === 0) {
    return {
      redacted_text: input ?? "",
      entities,
      remaining_entities: [],
      stats,
      quality: "excellent",
      version: LEGAL_REDACTION_VERSION,
    };
  }

  // 1) Mask public bodies so they survive verbatim.
  const { masked, placeholders: govPh } = buildGovMask(input);

  // 2) Apply patterns in order, sharing a single placeholder map per type so
  // identical surface forms always collapse to the same token (consistency).
  const counters = new Map<LegalEntityType, number>();
  const mapping = new Map<string, string>(); // key = `${type}::${match}` → placeholder

  let text = masked;
  for (const { type, re } of PATTERNS) {
    text = text.replace(re, (match) => {
      // Guard: never touch our own gov placeholders.
      if (match.includes("\u0001GOV")) return match;
      const key = `${type}::${match}`;
      const known = mapping.get(key);
      if (known) {
        stats.by_type[type].detected += 1;
        stats.by_type[type].replaced += 1;
        stats.detected_total += 1;
        stats.replaced_total += 1;
        entities.push({ type, original: match, placeholder: known });
        return known;
      }
      const n = (counters.get(type) ?? 0) + 1;
      counters.set(type, n);
      const placeholder = `[${type}_${n}]`;
      mapping.set(key, placeholder);
      stats.by_type[type].detected += 1;
      stats.by_type[type].replaced += 1;
      stats.detected_total += 1;
      stats.replaced_total += 1;
      entities.push({ type, original: match, placeholder });
      return placeholder;
    });
  }

  // 3) Unmask public bodies.
  const redacted = unmaskGov(text, govPh);

    // 4) Self-review + fallback risk markers.
  const review = selfReview(redacted);
  const riskMarkers = stats.detected_total === 0 ? findRiskMarkers(input) : [];
  const allRemaining = [...review, ...riskMarkers];

  for (const r of allRemaining) {
    stats.by_type[r.type].remaining += 1;
    stats.remaining_total += 1;
  }

  if (stats.detected_total === 0 && riskMarkers.length > 0) {
    stats.coverage_percent = 0;
  } else if (stats.detected_total === 0) {
    stats.coverage_percent = 100;
  } else {
    stats.coverage_percent = Math.max(
      0,
      Math.min(100, Math.round((stats.replaced_total / stats.detected_total) * 100))
    );
  }

  const quality: RedactionQuality =
    allRemaining.length === 0
      ? "excellent"
      : allRemaining.some((r) => r.severity === "high" || CRITICAL_TYPES.has(r.type))
        ? "unsafe"
        : "warning";

  return {
    redacted_text: redacted,
    entities,
    remaining_entities: allRemaining,
    stats,
    quality,
    version: LEGAL_REDACTION_VERSION,
  };
}

// Re-scan redacted text for any leftover identifiers. Skips strings that are
// already placeholders (`[TYPE_n]`).
export function selfReview(text: string): RemainingEntity[] {
  if (!text) return [];
  const placeholderRe = /\[[A-Z_]+_\d+\]/g;
  const masked = text.replace(placeholderRe, (m) => " ".repeat(m.length));
  // Also mask public bodies so they don't show up as remaining COMPANY hits.
  const { masked: maskedGov } = buildGovMask(masked);

  const found: RemainingEntity[] = [];
  const seen = new Set<string>();

  for (const { type, re, reason } of PATTERNS) {
    re.lastIndex = 0;
    const reCopy = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = reCopy.exec(maskedGov)) !== null) {
      const original = m[0];
      if (!original.trim()) continue;
      const key = `${type}::${original}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const severity: RemainingEntity["severity"] = CRITICAL_TYPES.has(type)
        ? "high"
        : type === "DATE" || type === "DOCUMENT_NUMBER"
          ? "low"
          : "medium";
      found.push({ type, text: original, reason, severity });
      if (found.length >= 200) return found;
    }
  }
  return found;
}

// Re-run review on (possibly hand-edited) text and recompute stats.
export function reviewRedactedText(
  redacted: string,
  baseStats?: RedactionStats,
): { remaining_entities: RemainingEntity[]; stats: RedactionStats; quality: RedactionQuality } {
    const remaining = selfReview(redacted);
  const riskMarkers = findRiskMarkers(redacted);
  const allRemaining = [...remaining, ...riskMarkers];

  const stats: RedactionStats = baseStats
    ? {
        ...baseStats,
        by_type: { ...baseStats.by_type },
        remaining_total: 0,
      }
    : {
        detected_total: 0,
        replaced_total: 0,
        remaining_total: 0,
        coverage_percent: 100,
        by_type: emptyByType(),
      };

  // reset per-type remaining
  for (const k of Object.keys(stats.by_type) as LegalEntityType[]) {
    stats.by_type[k].remaining = 0;
  }

  for (const r of allRemaining) {
    stats.by_type[r.type].remaining += 1;
    stats.remaining_total += 1;
  }

  if (stats.detected_total === 0 && riskMarkers.length > 0) {
    stats.coverage_percent = 0;
  } else if (stats.detected_total === 0) {
    stats.coverage_percent = 100;
  } else {
    stats.coverage_percent = Math.max(
      0,
      Math.min(100, Math.round((stats.replaced_total / stats.detected_total) * 100))
    );
  }

  const quality: RedactionQuality =
    allRemaining.length === 0
      ? "excellent"
      : allRemaining.some((r) => r.severity === "high" || CRITICAL_TYPES.has(r.type))
        ? "unsafe"
        : "warning";

  return { remaining_entities: allRemaining, stats, quality };

export function qualityLabel(q: RedactionQuality): string {
  switch (q) {
    case "excellent":
      return "🟢 Excellent";
    case "warning":
      return "🟡 Warning";
    case "unsafe":
      return "🔴 Unsafe";
  }
}

export function isAcceptable(
  redacted: string,
  stats: RedactionStats,
  remaining: RemainingEntity[],
  quality: RedactionQuality,
): { ok: boolean; reason: string | null } {
  if (!redacted || redacted.trim().length === 0) {
    return { ok: false, reason: "Обезличенный текст пуст" };
  }
  if (quality === "unsafe") {
    return { ok: false, reason: "Качество обезличивания — unsafe" };
  }
  if (remaining.length > 0) {
    return { ok: false, reason: `Найдено ${remaining.length} остаточных идентификаторов` };
  }
  if (stats.coverage_percent < 95) {
    return { ok: false, reason: `Покрытие ${stats.coverage_percent}% < 95%` };
  }
  return { ok: true, reason: null };
}
