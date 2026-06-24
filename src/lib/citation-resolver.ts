/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8 — Citation Resolver.
 *
 * Pure, deterministic. Does not call any AI, does not invent values.
 * Builds the most precise human-readable citation from existing fields only.
 *
 * Returns:
 *   - parts: ordered crumbs (Кодекс → ст. → ч. → п. → пп. → абз. → предл.)
 *   - label: short label (e.g. "НК РФ ст.54.1 п.2")
 *   - full:  full path joined with " · "
 *   - precise: true if at least one specific locator is present
 *   - warning: when nothing more than the act name is known
 *   - kind: detected citation kind
 */

export type CitationKind =
  | "law"
  | "court"
  | "plenum"
  | "fns"
  | "minfin"
  | "ekaterina"
  | "client_doc"
  | "generic";

export type ResolvedCitation = {
  kind: CitationKind;
  parts: Array<{ label: string; value: string }>;
  label: string;
  full: string;
  precise: boolean;
  warning: string | null;
  url?: string | null;
};

const ACT_ALIASES: Array<{ rx: RegExp; short: string }> = [
  { rx: /налог(овый)?\s*кодекс|^нк\s*рф|нк\s*рф/i, short: "НК РФ" },
  { rx: /гражданский\s*кодекс|^гк\s*рф|гк\s*рф/i, short: "ГК РФ" },
  { rx: /трудовой\s*кодекс|^тк\s*рф|тк\s*рф/i, short: "ТК РФ" },
  { rx: /арбитражн[а-я]+\s*процессуальн|^апк\s*рф|апк\s*рф/i, short: "АПК РФ" },
  { rx: /гражданск[а-я]+\s*процессуальн|^гпк\s*рф|гпк\s*рф/i, short: "ГПК РФ" },
  { rx: /кодекс\s*об\s*администр|^коап|коап\s*рф/i, short: "КоАП РФ" },
  { rx: /уголовн(ый|о-процессуальн)?\s*кодекс|^уп?к\s*рф/i, short: "УК РФ" },
  { rx: /земельн[а-я]+\s*кодекс|^зк\s*рф|зк\s*рф/i, short: "ЗК РФ" },
  { rx: /жилищн[а-я]+\s*кодекс|^жк\s*рф|жк\s*рф/i, short: "ЖК РФ" },
  { rx: /семейн[а-я]+\s*кодекс|^ск\s*рф|ск\s*рф/i, short: "СК РФ" },
  { rx: /банкрот/i, short: "ФЗ о банкротстве" },
];

export function detectKind(s: any): CitationKind {
  if (!s || typeof s !== "object") return "generic";
  const k = String(s.kind ?? s.type ?? s.source_type ?? "").toLowerCase();
  if (k.includes("plenum") || k.includes("пленум")) return "plenum";
  if (k.includes("court") || k.includes("суд") || s.case_number) return "court";
  if (k.includes("fns") || k.includes("фнс")) return "fns";
  if (k.includes("minfin") || k.includes("минфин")) return "minfin";
  if (k.includes("ekaterina") || k.includes("екатерин") || k.includes("practice_archive"))
    return "ekaterina";
  if (k.includes("client") || k.includes("intake") || k.includes("ocr") || s.ocr_block != null)
    return "client_doc";
  if (
    k.includes("law") ||
    k.includes("норм") ||
    k.includes("кодекс") ||
    k.includes("статья") ||
    s.article ||
    s.code
  )
    return "law";
  return "generic";
}

function shortActName(raw?: string | null): string | null {
  if (!raw) return null;
  for (const a of ACT_ALIASES) {
    if (a.rx.test(raw)) return a.short;
  }
  // Strip very long names
  const trimmed = String(raw).trim();
  return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
}

function pickStr(...vals: any[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

export function resolveCitation(source: any): ResolvedCitation {
  const kind = detectKind(source);
  const parts: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: any) => {
    if (value == null) return;
    const s = String(value).trim();
    if (!s) return;
    parts.push({ label, value: s });
  };

  if (!source || typeof source !== "object") {
    return {
      kind,
      parts: [],
      label: String(source ?? "—"),
      full: String(source ?? "—"),
      precise: false,
      warning: "Точная локализация отсутствует.",
    };
  }

  const url: string | null =
    source.url ?? source.link ?? source.official_url ?? source.file_url ?? null;

  // Pre-parse citation strings like "НК РФ ст.54.1 п.2"
  let parsed: { article?: string; part?: string; point?: string; subpoint?: string } = {};
  const cite = pickStr(source.citation, source.title, source.name);
  if (cite) {
    const m = {
      article: /ст(?:атья|\.)\s*([0-9]+(?:[.\-][0-9]+)?)/i.exec(cite),
      part: /ч(?:асть|\.)\s*([0-9]+)/i.exec(cite),
      point: /п(?:ункт|\.)\s*([0-9]+)/i.exec(cite),
      subpoint: /пп(?:одпункт|\.)\s*([0-9]+(?:[.\-][0-9]+)?)/i.exec(cite),
    };
    parsed = {
      article: m.article?.[1],
      part: m.part?.[1],
      point: m.point?.[1],
      subpoint: m.subpoint?.[1],
    };
  }

  if (kind === "law") {
    const actRaw = pickStr(source.act, source.code, source.law, source.title, source.name);
    const act = shortActName(actRaw);
    if (act) push("Акт", act);
    push("ст.", pickStr(source.article, source["статья"], parsed.article));
    push("ч.", pickStr(source.part, source["часть"], parsed.part));
    push("п.", pickStr(source.point, source["пункт"], parsed.point));
    push("пп.", pickStr(source.subpoint, source["подпункт"], parsed.subpoint));
    push("абз.", pickStr(source.paragraph, source["абзац"]));
    push("предл.", pickStr(source.sentence, source["предложение"]));
  } else if (kind === "court") {
    push("Суд", pickStr(source.court, source["суд"]));
    push("Дело", pickStr(source.case_number, source.case, source.number));
    push("Дата", pickStr(source.date, source.date_decided));
    push("п.", pickStr(source.point));
    push("абз.", pickStr(source.paragraph));
    push("стр.", pickStr(source.page));
  } else if (kind === "plenum") {
    const title = pickStr(source.title, source.name) ?? "Пленум";
    push("Постановление", title);
    push("№", pickStr(source.number, source.case_number));
    push("Дата", pickStr(source.date));
    push("п.", pickStr(source.point));
    push("пп.", pickStr(source.subpoint));
    push("абз.", pickStr(source.paragraph));
  } else if (kind === "fns" || kind === "minfin") {
    push(kind === "fns" ? "Письмо ФНС" : "Письмо Минфина", pickStr(source.title, source.name) ?? "Письмо");
    push("№", pickStr(source.number, source.letter_number));
    push("Дата", pickStr(source.date));
    push("Разд.", pickStr(source.section));
    push("п.", pickStr(source.point));
    push("абз.", pickStr(source.paragraph));
  } else if (kind === "ekaterina") {
    push("Архив", pickStr(source.archive, source.archive_name));
    push("Файл", pickStr(source.file, source.file_name));
    push("Версия", pickStr(source.version));
    push("стр.", pickStr(source.page));
    push("абз.", pickStr(source.paragraph));
  } else if (kind === "client_doc") {
    push("Файл", pickStr(source.file, source.file_name, source.document_name));
    push("стр.", pickStr(source.page));
    push("абз.", pickStr(source.paragraph));
    push("OCR блок", pickStr(source.ocr_block));
  } else {
    push("Название", pickStr(source.title, source.name, source.source_id));
    push("Тип", pickStr(source.type, source.kind));
    push("Цитата", pickStr(source.citation));
  }

  // Precise = more than 1 part, OR the only part is a specific locator (not just "Акт"/"Файл")
  const specificLabels = new Set(["ст.", "ч.", "п.", "пп.", "абз.", "предл.", "Дело", "№", "Дата", "стр.", "Разд.", "OCR блок"]);
  const precise = parts.some((p) => specificLabels.has(p.label));

  const label = parts
    .slice(0, 4)
    .map((p) => (p.label === "Акт" || p.label === "Файл" || p.label === "Постановление" ? p.value : `${p.label}${p.value}`))
    .join(" ");

  const full = parts.map((p) => `${p.label} ${p.value}`).join(" · ");

  const warning = precise
    ? null
    : "Точная локализация отсутствует. Проверьте источник вручную.";

  return {
    kind,
    parts,
    label: label || full || "Источник",
    full: full || label || "Источник",
    precise,
    warning,
    url,
  };
}

/** Copy a one-line citation reference to clipboard. */
export async function copyCitationToClipboard(source: any): Promise<boolean> {
  const r = resolveCitation(source);
  const text = r.url ? `${r.full} — ${r.url}` : r.full;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
