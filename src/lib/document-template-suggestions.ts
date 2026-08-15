import type { DocumentTemplate } from "@/lib/document-templates";

export type TemplateSuggestion = {
  template: DocumentTemplate;
  score: number;
  reasons: string[];
  conflictsWithSelection: boolean;
};

export type PackageDocumentText = {
  id: string;
  file_name?: string | null;
  text?: string | null;
};

type Rule = {
  pattern: RegExp;
  codes: string[];
  score: number;
  reason: string;
};

const RULES: Rule[] = [
  {
    pattern:
      /(?:выписк[аи]\s+(?:из\s+)?(?:егрюл|единого\s+государственного\s+реестра\s+юридических\s+лиц)|един(?:ый|ого)\s+государственн(?:ый|ого)\s+реестр(?:а)?\s+юридических\s+лиц|лист\s+записи\s+егрюл|огрн)/i,
    codes: ["tax_counterparty_due_diligence", "counterparty_due_diligence"],
    score: 12,
    reason: "В комплекте обнаружены регистрационные сведения ЕГРЮЛ/ОГРН",
  },
  {
    pattern:
      /(?:требовани[ея].{0,120}(?:фнс|ифнс|налогов)|(?:фнс|ифнс|налогов).{0,120}требовани[ея])/is,
    codes: ["response_to_tax_request", "tax_request_legality_analysis"],
    score: 14,
    reason: "Обнаружено требование налогового органа",
  },
  {
    pattern: /акт.{0,80}(?:выездн|камеральн|налогов).{0,80}проверк/is,
    codes: ["tax_audit_objections_extended", "objections_tax_audit"],
    score: 15,
    reason: "Обнаружен акт налоговой проверки",
  },
  {
    pattern: /(?:решени[ея].{0,100}(?:фнс|ифнс|налогов)|(?:фнс|ифнс|налогов).{0,100}решени[ея])/is,
    codes: ["tax_decision_analysis", "tax_ufns_appeal"],
    score: 14,
    reason: "Обнаружено решение налогового органа",
  },
  {
    pattern: /(?:\bндс\b|сч[её]т[-\s]?фактур|налогов.{0,30}вычет)/i,
    codes: ["tax_vat_explanations", "tax_explanations"],
    score: 10,
    reason: "Комплект содержит сведения по НДС или налоговым вычетам",
  },
  {
    pattern: /(?:арбитражн.{0,30}суд|заявлени[ея].{0,80}оспариван.{0,80}решени[ея])/is,
    codes: ["tax_court_position", "tax_arbitration_claim"],
    score: 12,
    reason: "Обнаружены материалы арбитражного налогового спора",
  },
  {
    pattern: /(?:договор|контракт|соглашени[ея]).{0,120}(?:сторон|предмет|цен[аы]|обязательств)/is,
    codes: ["contract_review", "contract_analysis"],
    score: 8,
    reason: "Обнаружен договорный документ",
  },
];

export function hasExtractedDocumentText(text: string | null | undefined): boolean {
  return Boolean(text && text.trim().length > 0);
}

export function suggestTemplatesForPackage(
  documents: PackageDocumentText[],
  templates: DocumentTemplate[],
  selectedTemplate: DocumentTemplate,
  limit = 3,
): TemplateSuggestion[] {
  const packageText = documents
    .map((document) => `${document.file_name ?? ""}\n${document.text ?? ""}`)
    .join("\n\n")
    .slice(0, 180_000);

  if (!packageText.trim()) return [];

  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  for (const rule of RULES) {
    if (!rule.pattern.test(packageText)) continue;
    for (const code of rule.codes) {
      const current = scores.get(code) ?? { score: 0, reasons: new Set<string>() };
      current.score += rule.score;
      current.reasons.add(rule.reason);
      scores.set(code, current);
    }
  }

  const normalized = packageText.toLowerCase();
  for (const template of templates) {
    const haystack = [template.title, template.description, template.subcategory]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const tokens = haystack.match(/[а-яёa-z0-9]{5,}/gi) ?? [];
    const matches = new Set(tokens.filter((token) => normalized.includes(token)));
    if (matches.size < 2) continue;
    const current = scores.get(template.code) ?? { score: 0, reasons: new Set<string>() };
    current.score += Math.min(matches.size, 4);
    current.reasons.add("Название и назначение шаблона совпадают с содержанием комплекта");
    scores.set(template.code, current);
  }

  return templates
    .flatMap((template) => {
      const match = scores.get(template.code);
      if (!match || match.score < 5 || template.code === selectedTemplate.code) return [];
      return [
        {
          template,
          score: match.score,
          reasons: [...match.reasons],
          conflictsWithSelection:
            template.category !== selectedTemplate.category ||
            Boolean(
              template.practice_area &&
              selectedTemplate.practice_area &&
              template.practice_area !== selectedTemplate.practice_area,
            ),
        } satisfies TemplateSuggestion,
      ];
    })
    .sort((a, b) => b.score - a.score || a.template.sort_order - b.template.sort_order)
    .slice(0, limit);
}
