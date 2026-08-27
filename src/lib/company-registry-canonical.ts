import {
  normalizeCompanyName,
  normalizeDigits,
  normalizeOkvedCode,
  REGISTRY_VALUE_SOURCE,
  type AnswerRow,
  type AutofillEntry,
  type CompanyRegistryConflict,
  type CompanyRegistryProfile,
  type DocumentCompanyProfile,
} from "./company-registry.ts";

const HUMAN_SOURCES = new Set(["manual", "lawyer", "lawyer_confirmed", "user"]);

const IDENTIFIER_CONFLICT_TO_FIELD: Record<string, string> = {
  inn: "taxpayer_inn",
  ogrn: "taxpayer_ogrn",
  kpp: "taxpayer_kpp",
};

const FIELD_LABELS: Record<string, string> = {
  taxpayer_name: "Наименование налогоплательщика",
  taxpayer_inn: "ИНН",
  taxpayer_ogrn: "ОГРН / ОГРНИП",
  taxpayer_kpp: "КПП",
  taxpayer_legal_address: "Юридический адрес",
  main_okved: "Основной ОКВЭД",
  business_activity: "Сфера деятельности",
};

function answerToString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") return String(value);
  return null;
}

export function isHumanProtectedAnswer(row: AnswerRow | undefined): boolean {
  if (!row || !answerToString(row.field_value)) return false;
  if (row.value_source === REGISTRY_VALUE_SOURCE) return false;
  if (row.is_verified === true) return true;
  const source = (row.value_source ?? "").trim().toLowerCase();
  return HUMAN_SOURCES.has(source) || source.includes("lawyer");
}

function isMachineExtracted(row: AnswerRow | undefined): boolean {
  if (!row || !answerToString(row.field_value)) return false;
  if (row.value_source === REGISTRY_VALUE_SOURCE) return true;
  if (isHumanProtectedAnswer(row)) return false;
  const source = (row.value_source ?? "").trim().toLowerCase();
  return (
    source.startsWith("ai") ||
    source.includes("ocr") ||
    source.includes("extract") ||
    source.includes("document") ||
    source === "autofill"
  );
}

export function formatRegistryBusinessActivity(profile: CompanyRegistryProfile): string | null {
  if (!profile.business_activity_name) return null;
  if (profile.okved_main) return `${profile.okved_main} ${profile.business_activity_name}`;
  return profile.business_activity_name;
}

export function getPreservedDocumentBusinessActivity(params: {
  profile: CompanyRegistryProfile;
  documentProfile: DocumentCompanyProfile;
  answers: AnswerRow[];
}): string | null {
  if (params.profile.business_activity_name) return null;
  const preserved = params.documentProfile.business_activity?.trim();
  const registryCode = params.profile.okved_main?.trim();
  if (!preserved || !registryCode) return null;

  const current = params.answers.find((row) => row.field_name === "business_activity");
  if (isHumanProtectedAnswer(current)) return null;

  const registryNormalized = normalizeOkvedCode(registryCode);
  if (!registryNormalized) return null;

  const documentCode = params.documentProfile.okved_main?.trim();
  if (documentCode) {
    if (normalizeOkvedCode(documentCode) !== registryNormalized) return null;
    return preserved;
  }

  const codeCandidates = preserved.match(/\d{2}(?:\.\d{1,3}){1,2}/g) ?? [];
  if (codeCandidates.some((candidate) => normalizeOkvedCode(candidate) === registryNormalized)) {
    return preserved;
  }

  return null;
}

export function buildCanonicalRegistryOverrides(params: {
  profile: CompanyRegistryProfile;
  answers: AnswerRow[];
  schemaFieldKeys: string[];
  conflicts: CompanyRegistryConflict[];
}): AutofillEntry[] {
  const known = new Set(params.schemaFieldKeys);
  const byName = new Map<string, AnswerRow>();
  for (const row of params.answers) byName.set(row.field_name, row);

  const blockedIdentifierFields = new Set(
    params.conflicts
      .filter((conflict) => conflict.severity === "high" || conflict.field === "kpp")
      .map((conflict) => IDENTIFIER_CONFLICT_TO_FIELD[conflict.field])
      .filter((field): field is string => Boolean(field)),
  );

  const mapping: Array<[string, string | null]> = [
    ["taxpayer_name", params.profile.name_full ?? params.profile.name_short],
    ["taxpayer_inn", params.profile.inn],
    ["taxpayer_ogrn", params.profile.ogrn ?? params.profile.ogrnip],
    ["taxpayer_kpp", params.profile.kpp],
    ["taxpayer_legal_address", params.profile.legal_address],
    ["main_okved", params.profile.okved_main],
    ["business_activity", formatRegistryBusinessActivity(params.profile)],
  ];

  const resolveFieldName = (fieldName: string): string | null => {
    const aliases: Record<string, string[]> = {
      taxpayer_legal_address: ["taxpayer_legal_address", "taxpayer_address", "legal_address"],
      // `business_activity` is a descriptive field. Never place a bare OKVED
      // code there when the template has no dedicated code field.
      main_okved: ["main_okved", "okved_main"],
    };
    const candidates = aliases[fieldName] ?? [fieldName];
    if (known.size === 0) return candidates[0];
    return candidates.find((candidate) => known.has(candidate)) ?? null;
  };

  const plan: AutofillEntry[] = [];
  for (const [fieldName, value] of mapping) {
    if (!value) continue;
    const targetFieldName = resolveFieldName(fieldName);
    if (!targetFieldName) continue;
    const current = byName.get(targetFieldName);
    if (isHumanProtectedAnswer(current)) continue;
    if (blockedIdentifierFields.has(fieldName) || blockedIdentifierFields.has(targetFieldName)) continue;
    if (current && !isMachineExtracted(current)) continue;

    plan.push({
      field_name: targetFieldName,
      field_label: FIELD_LABELS[fieldName] ?? FIELD_LABELS[targetFieldName] ?? targetFieldName,
      field_value: value,
      value_source: REGISTRY_VALUE_SOURCE,
    });
  }
  return plan;
}

const ADDRESS_WORD_STOP = new Set([
  "россия",
  "российская",
  "федерация",
  "город",
  "г",
  "улица",
  "ул",
  "дом",
  "д",
  "строение",
  "стр",
  "корпус",
  "корп",
  "офис",
  "оф",
  "этаж",
  "помещение",
  "помещ",
  "квартира",
  "кв",
]);

function normalizeAddressTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function addressNumbers(value: string): string[] {
  return normalizeAddressTokens(value)
    .filter((token) => /\d/.test(token))
    .sort();
}

function addressWords(value: string): Set<string> {
  return new Set(
    normalizeAddressTokens(value).filter(
      (token) => !/\d/.test(token) && token.length >= 3 && !ADDRESS_WORD_STOP.has(token),
    ),
  );
}

export function addressesEquivalent(left: string, right: string): boolean {
  const leftNumbers = addressNumbers(left);
  const rightNumbers = addressNumbers(right);
  if (leftNumbers.length > 0 && rightNumbers.length > 0) {
    if (leftNumbers.join("|") !== rightNumbers.join("|")) return false;
  }

  const leftWords = addressWords(left);
  const rightWords = addressWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return false;

  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) intersection += 1;
  }
  const denominator = Math.min(leftWords.size, rightWords.size);
  return denominator > 0 && intersection / denominator >= 0.8;
}

function activityEquivalent(
  documentValue: string,
  registryValue: string,
  profile: CompanyRegistryProfile,
): boolean {
  const code = profile.okved_main?.trim();
  if (code && documentValue.includes(code)) return true;
  const withoutCode = code ? documentValue.replace(code, " ") : documentValue;
  return normalizeCompanyName(withoutCode) === normalizeCompanyName(registryValue);
}

export function filterFormattingOnlyConflicts(
  conflicts: CompanyRegistryConflict[],
  profile: CompanyRegistryProfile,
): CompanyRegistryConflict[] {
  return conflicts.filter((conflict) => {
    if (conflict.field === "legal_address") {
      return !addressesEquivalent(conflict.document_value, conflict.registry_value);
    }
    if (conflict.field === "business_activity") {
      return !activityEquivalent(conflict.document_value, conflict.registry_value, profile);
    }
    if (conflict.field === "inn" || conflict.field === "ogrn" || conflict.field === "kpp") {
      return normalizeDigits(conflict.document_value) !== normalizeDigits(conflict.registry_value);
    }
    return true;
  });
}
