/**
 * Lightweight regex-based PII anonymizer for Russian legal documents.
 * Returns anonymized text and a stable map of entities -> placeholders.
 *
 * Modes:
 *  - soft:   ФИО, контакты, паспорт, ИНН, адреса, СНИЛС, ОГРН, банковские
 *  - strict: + суммы, даты, номера договоров, кадастровые номера
 *  - full:   + названия компаний
 */

export type AnonymizeMode = "soft" | "strict" | "full";

export type EntityKind =
  | "ФИО"
  | "КОМПАНИЯ"
  | "АДРЕС"
  | "ИНН"
  | "ОГРН"
  | "СНИЛС"
  | "ПАСПОРТ"
  | "ТЕЛЕФОН"
  | "EMAIL"
  | "ДОГОВОР"
  | "КАДАСТР"
  | "СЧЁТ"
  | "БИК"
  | "СУММА"
  | "ДАТА";

export interface FoundEntity {
  kind: EntityKind;
  original: string;
  placeholder: string;
}

interface PatternDef {
  kind: EntityKind;
  re: RegExp;
}

// Order matters: longer / more specific patterns first.
const PATTERNS_SOFT: PatternDef[] = [
  { kind: "EMAIL", re: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
  { kind: "ТЕЛЕФОН", re: /(?:\+7|8)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g },
  { kind: "СНИЛС", re: /\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g },
  { kind: "ОГРН", re: /\b(?:\d{13}|\d{15})\b/g },
  { kind: "ИНН", re: /\b(?:\d{10}|\d{12})\b/g },
  { kind: "ПАСПОРТ", re: /\b\d{2}\s?\d{2}\s?\d{6}\b/g },
  { kind: "БИК", re: /\bБИК[:\s]*\d{9}\b/gi },
  { kind: "СЧЁТ", re: /\b(?:р\/?с|р\.?с\.?|к\/?с|сч[её]т)[:\s№]*\d{20}\b/gi },
  {
    kind: "АДРЕС",
    re: /(?:г\.?\s?[А-ЯЁ][а-яё-]+|[А-ЯЁ][а-яё]+ская\s+область|обл\.?\s?[А-ЯЁ][а-яё-]+)(?:[,;]\s*(?:ул\.?|улица|пр-?т\.?|проспект|пер\.?|переулок|шоссе|ш\.?|д\.?|дом|кв\.?|квартира|оф\.?|офис)\s?[А-ЯЁа-яё0-9.\- ]+)+/g,
  },
  // ФИО — last name + initials, or last + first + patronymic
  {
    kind: "ФИО",
    re: /\b[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g,
  },
  {
    kind: "ФИО",
    re: /\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)\s+[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\b/g,
  },
  {
    kind: "ФИО",
    re: /\b[А-ЯЁ][а-яё]+(?:ов|ев|ин|ын|ский|цкий|ова|ева|ина|ына|ская|цкая)\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична)\b/g,
  },
];

const PATTERNS_STRICT_EXTRA: PatternDef[] = [
  {
    kind: "ДОГОВОР",
    re: /(?:договор|контракт|соглашение)(?:\s+[№N#])\s*[A-ZА-Я0-9\-\/]+/gi,
  },
  { kind: "КАДАСТР", re: /\b\d{2}:\d{2}:\d{6,7}:\d{1,5}\b/g },
  {
    kind: "СУММА",
    re: /\b\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?\s?(?:руб(?:лей|\.)?|₽|RUB|USD|EUR|долл(?:аров|\.)?|евро)\b/gi,
  },
  { kind: "ДАТА", re: /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/g },
  {
    kind: "ДАТА",
    re: /\b\d{1,2}\s+(?:январ[яь]|феврал[яь]|март[а]?|апрел[яь]|ма[йя]|июн[яь]|июл[яь]|август[а]?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])\s+\d{4}\s*(?:г\.?|года)?/gi,
  },
];

const PATTERNS_FULL_EXTRA: PatternDef[] = [
  {
    kind: "КОМПАНИЯ",
    re: /(?:ООО|АО|ПАО|ЗАО|ИП|НКО|ФГУП|МУП|ОАО|ТСЖ)\s+["«][^"»]+["»]/g,
  },
  {
    kind: "КОМПАНИЯ",
    re: /["«][А-ЯЁA-Z][^"»]{2,80}["»]\s*(?:ООО|АО|ПАО|ЗАО)/g,
  },
];

export function anonymize(
  input: string,
  mode: AnonymizeMode,
): { text: string; entities: FoundEntity[] } {
  if (!input) return { text: "", entities: [] };
  const patterns: PatternDef[] = [...PATTERNS_SOFT];
  if (mode === "strict" || mode === "full") patterns.push(...PATTERNS_STRICT_EXTRA);
  if (mode === "full") patterns.push(...PATTERNS_FULL_EXTRA);

  const counters = new Map<EntityKind, number>();
  const mapping = new Map<string, { kind: EntityKind; placeholder: string }>();
  const entities: FoundEntity[] = [];

  let text = input;
  for (const { kind, re } of patterns) {
    text = text.replace(re, (match) => {
      const key = `${kind}::${match}`;
      const known = mapping.get(key);
      if (known) return known.placeholder;
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      const placeholder = `[${kind}_${n}]`;
      mapping.set(key, { kind, placeholder });
      entities.push({ kind, original: match, placeholder });
      return placeholder;
    });
  }
  return { text, entities };
}

export function isTextLike(mime: string | null | undefined, ext: string | null | undefined) {
  const m = (mime ?? "").toLowerCase();
  const e = (ext ?? "").toLowerCase();
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return true;
  return ["txt", "md", "csv", "tsv", "json", "xml", "html", "htm", "log", "rtf"].includes(e);
}
