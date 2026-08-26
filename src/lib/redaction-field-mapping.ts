/**
 * Session-scoped mapping between redaction tokens shown in the intake form and
 * the canonical (real) field values.
 *
 * Contract:
 *  - canonical values are never overwritten by redaction; they live in the
 *    mapping and in `document_intake_answers`;
 *  - display values may contain tokens in the same `[TYPE_N]` format that
 *    `legal-redaction.ts` produces for document text;
 *  - the same canonical value always maps to the same token inside one session;
 *  - restoring is deterministic and structured (field slot → canonical value),
 *    never a free-text replace and never an LLM round-trip;
 *  - anything unknown, ambiguous or corrupt fails closed.
 */

/** Matches tokens produced by legal-redaction and by this module: `[PERSON_1]`. */
export const REDACTION_TOKEN_RE = /\[[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_\d+\]/g;

export type RedactionFieldEntityType =
  | "PERSON"
  | "COMPANY"
  | "INN"
  | "OGRN"
  | "ADDRESS"
  | "PHONE"
  | "EMAIL"
  | "ACCOUNT"
  | "PASSPORT"
  | "VALUE";

export type RedactionFieldMapping = {
  version: 1;
  session_id: string;
  /** token → canonical value (+ the field slots that use it). */
  tokens: Record<
    string,
    { canonical_value: string; entity_type: RedactionFieldEntityType; field_names: string[] }
  >;
  /** field name → token currently shown for it. */
  fields: Record<string, { token: string; canonical_value: string }>;
};

export class RedactionMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedactionMappingError";
  }
}

const FIELD_PATTERNS: Array<[RegExp, RedactionFieldEntityType]> = [
  [/(^|_)(inn)($|_)/i, "INN"],
  [/(ogrn|ogrnip)/i, "OGRN"],
  [/(passport)/i, "PASSPORT"],
  [/(account|schet|bank_)/i, "ACCOUNT"],
  [/(email|e_mail)/i, "EMAIL"],
  [/(phone|tel)/i, "PHONE"],
  [/(address|adres)/i, "ADDRESS"],
  [/(person_name|client_name|representative_name|principal_name|authorized_person|fio|full_name|director)/i, "PERSON"],
  [/(taxpayer_name|counterparty_name|company_name|organization|org_name)/i, "COMPANY"],
];

/**
 * Only personal / identifying slots are redacted. Legal position, amounts,
 * dates and free-text argumentation must stay readable for the lawyer.
 */
export function classifyRedactableField(fieldName: string): RedactionFieldEntityType | null {
  for (const [re, type] of FIELD_PATTERNS) {
    if (re.test(fieldName)) return type;
  }
  return null;
}

function canonicalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build (or extend) the mapping for a set of canonical answers. Existing tokens
 * are preserved so a token never changes meaning inside a session.
 */
export function buildFieldRedactionMapping(input: {
  sessionId: string;
  answers: Record<string, unknown>;
  previous?: RedactionFieldMapping | null;
}): RedactionFieldMapping {
  const previous = input.previous;
  const mapping: RedactionFieldMapping = {
    version: 1,
    session_id: input.sessionId,
    tokens: previous && previous.session_id === input.sessionId ? { ...previous.tokens } : {},
    fields: {},
  };

  const byValue = new Map<string, string>();
  const counters = new Map<RedactionFieldEntityType, number>();
  for (const [token, entry] of Object.entries(mapping.tokens)) {
    byValue.set(`${entry.entity_type}::${entry.canonical_value}`, token);
    const n = Number(token.slice(0, -1).split("_").pop());
    if (Number.isFinite(n)) {
      counters.set(entry.entity_type, Math.max(counters.get(entry.entity_type) ?? 0, n));
    }
  }

  for (const fieldName of Object.keys(input.answers).sort()) {
    const entityType = classifyRedactableField(fieldName);
    if (!entityType) continue;
    const canonical = canonicalString(input.answers[fieldName]);
    if (!canonical) continue;
    if (REDACTION_TOKEN_RE.test(canonical)) {
      REDACTION_TOKEN_RE.lastIndex = 0;
      throw new RedactionMappingError(
        `Поле «${fieldName}» уже содержит токен обезличивания — исходное значение потеряно.`,
      );
    }
    REDACTION_TOKEN_RE.lastIndex = 0;

    const key = `${entityType}::${canonical}`;
    let token = byValue.get(key);
    if (!token) {
      const next = (counters.get(entityType) ?? 0) + 1;
      counters.set(entityType, next);
      token = `[${entityType}_${next}]`;
      byValue.set(key, token);
      mapping.tokens[token] = { canonical_value: canonical, entity_type: entityType, field_names: [] };
    }
    const entry = mapping.tokens[token];
    if (!entry.field_names.includes(fieldName)) entry.field_names.push(fieldName);
    mapping.fields[fieldName] = { token, canonical_value: canonical };
  }

  return mapping;
}

/** Produce the display (anonymized) answers. Canonical input is not mutated. */
export function applyFieldRedaction(
  answers: Record<string, unknown>,
  mapping: RedactionFieldMapping,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...answers };
  for (const [fieldName, entry] of Object.entries(mapping.fields)) {
    if (fieldName in out) out[fieldName] = entry.token;
  }
  return out;
}

/**
 * Manual lawyer edits win over extracted values: the mapping is re-pointed to
 * the new canonical value while keeping token identity stable per value.
 */
export function applyManualFieldEdit(
  mapping: RedactionFieldMapping,
  fieldName: string,
  newValue: unknown,
): RedactionFieldMapping {
  const canonical = canonicalString(newValue);
  const isToken = canonical ? isRedactionToken(canonical) : false;
  if (isToken) return mapping; // editing the masked display is a no-op

  const next = buildFieldRedactionMapping({
    sessionId: mapping.session_id,
    answers: {
      ...Object.fromEntries(
        Object.entries(mapping.fields).map(([k, v]) => [k, v.canonical_value]),
      ),
      [fieldName]: canonical ?? "",
    },
    previous: mapping,
  });
  return next;
}

export function isRedactionToken(value: string): boolean {
  REDACTION_TOKEN_RE.lastIndex = 0;
  const match = value.trim().match(new RegExp(`^${REDACTION_TOKEN_RE.source}$`));
  return Boolean(match);
}

/** Deep scan for leftover tokens in any JSON-ish payload. */
export function findRedactionTokens(value: unknown, path = "$"): Array<{ path: string; token: string }> {
  const found: Array<{ path: string; token: string }> = [];
  if (typeof value === "string") {
    REDACTION_TOKEN_RE.lastIndex = 0;
    for (const m of value.matchAll(REDACTION_TOKEN_RE)) found.push({ path, token: m[0] });
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...findRedactionTokens(item, `${path}[${i}]`)));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      found.push(...findRedactionTokens(v, `${path}.${k}`));
    }
  }
  return found;
}

/**
 * Restore canonical values for generation. Fail-closed: an unknown token, or a
 * token left over after restoration, aborts generation instead of shipping a
 * document that still contains `[PERSON_1]`.
 */
export function restoreCanonicalAnswers(
  displayAnswers: Record<string, unknown>,
  mapping: RedactionFieldMapping | null | undefined,
): Record<string, unknown> {
  const tokensPresent = findRedactionTokens(displayAnswers);
  if (tokensPresent.length === 0) return { ...displayAnswers };

  if (!mapping || mapping.version !== 1 || !mapping.tokens) {
    throw new RedactionMappingError(
      "Генерация остановлена: карта обезличивания отсутствует или повреждена, восстановить реальные значения невозможно.",
    );
  }

  const out: Record<string, unknown> = { ...displayAnswers };
  for (const [fieldName, value] of Object.entries(displayAnswers)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!isRedactionToken(trimmed)) continue;

    const entry = mapping.tokens[trimmed];
    if (!entry || !entry.canonical_value) {
      throw new RedactionMappingError(
        `Генерация остановлена: для токена ${trimmed} (поле «${fieldName}») нет исходного значения.`,
      );
    }
    if (entry.field_names.length > 0 && !entry.field_names.includes(fieldName)) {
      throw new RedactionMappingError(
        `Генерация остановлена: токен ${trimmed} неоднозначен и не закреплён за полем «${fieldName}».`,
      );
    }
    out[fieldName] = entry.canonical_value;
  }

  const leftover = findRedactionTokens(out);
  if (leftover.length > 0) {
    throw new RedactionMappingError(
      `Генерация остановлена: в анкете остались токены обезличивания (${leftover
        .map((l) => l.token)
        .join(", ")}).`,
    );
  }
  return out;
}

/** Last line of defence right before the generator is invoked. */
export function assertNoRedactionTokens(label: string, value: unknown): void {
  const leftover = findRedactionTokens(value, label);
  if (leftover.length > 0) {
    throw new RedactionMappingError(
      `Генерация остановлена: ${label} содержит токены обезличивания (${leftover
        .map((l) => l.token)
        .join(", ")}).`,
    );
  }
}
