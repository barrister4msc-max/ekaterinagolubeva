import type { LegalAnalysisResult } from "@/lib/legal-analysis";

export type HumanResearchProvider = "strizh" | "garant" | "consultant" | "other";

export type HumanResearchRequest = {
  provider: HumanResearchProvider;
  title: string;
  prompt: string;
  issue_ids: string[];
  diagnostics: {
    source_sufficiency_status: string | null;
    external_search_required: boolean;
    external_search_reason: string | null;
  };
};

const MAX_ITEMS = 12;
const MAX_ITEM_CHARS = 700;
const MAX_PROMPT_CHARS = 18_000;

function clean(value: unknown, max = MAX_ITEM_CHARS): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function unique(values: unknown, maxItems = MAX_ITEMS): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => clean(item)).filter((item): item is string => !!item))].slice(0, maxItems);
}

function numbered(title: string, values: string[]): string {
  if (values.length === 0) return "";
  return `${title}:\n${values.map((value, index) => `${index + 1}. ${value}`).join("\n")}`;
}

function challengeIssues(analysis: LegalAnalysisResult | null | undefined): string[] {
  return unique(analysis?.challenge_result?.issues?.map((issue) => issue.description) ?? []);
}

function deriveIssueIds(analysis: LegalAnalysisResult | null | undefined): string[] {
  const explicit = unique(
    (analysis?.conclusions ?? []).map((item) => item.conclusion_id),
    20,
  );
  if (explicit.length > 0) return explicit;

  const legalIssues = unique(analysis?.research_query?.legal_issues ?? [], 20);
  return legalIssues.map((_, index) => `research-issue-${index + 1}`);
}

export function buildHumanResearchRequest(
  provider: HumanResearchProvider,
  analysis: LegalAnalysisResult | null | undefined,
): HumanResearchRequest {
  const query = analysis?.research_query;
  const legalIssues = unique(query?.legal_issues ?? []);
  const topics = unique(query?.research_topics ?? []);
  const keywords = unique(query?.keywords ?? []);
  const facts = unique(query?.facts ?? []);
  const gaps = unique(analysis?.source_sufficiency?.gaps ?? []);
  const challenge = challengeIssues(analysis);
  const adverse = unique(analysis?.challenge_result?.adverse_sources ?? []);
  const counterArguments = unique(analysis?.counter_arguments ?? []);
  const issueIds = deriveIssueIds(analysis);

  const providerName = provider === "strizh"
    ? "Стриж"
    : provider === "garant"
      ? "Гарант"
      : provider === "consultant"
        ? "КонсультантПлюс"
        : "внешней правовой системе";

  const sections = [
    `Проведи правовое исследование в ${providerName}.`,
    "ВАЖНО: ниже передан поисковый контекст KATI LAWYER. Это не доказанные факты и не готовая правовая позиция. Используй его только для поиска и проверки источников. Не превращай предположения, query expansion или формулировки KATI LAWYER в установленные факты дела.",
    "Верни результат так, чтобы каждый правовой вывод можно было проверить по первоисточнику. Для каждого найденного документа укажи максимально точные реквизиты: вид документа, орган/суд, номер, дату, номер дела, статью/пункт, название, ссылку на источник и кратко — какой вопрос он подтверждает или опровергает.",
    "Отдельно найди неблагоприятные источники и контраргументы. Если редакция нормы зависит от даты, укажи применимую редакцию и период действия. Если источник не удаётся надежно идентифицировать — прямо пометь это, не достраивай реквизиты.",
    numbered("Правовые вопросы", legalIssues),
    numbered("Темы исследования", topics),
    numbered("Пробелы Source Sufficiency", gaps),
    numbered("Вопросы Challenge", challenge),
    numbered("Контраргументы для проверки", counterArguments),
    numbered("Неблагоприятные источники/направления, уже отмеченные системой", adverse),
    numbered("Фактический контекст только для поиска", facts),
    numbered("Ключевые слова", keywords),
    issueIds.length > 0
      ? `Research issue IDs KATI LAWYER: ${issueIds.join(", ")}. По возможности укажи рядом с каждым найденным источником, к какому issue ID он относится.`
      : "",
    "Формат ответа: 1) найденные источники с точными реквизитами и ссылками; 2) что они подтверждают; 3) неблагоприятные источники/контраргументы; 4) вопросы, по которым источников недостаточно; 5) список использованных реквизитов отдельным блоком для машинного импорта.",
  ].filter(Boolean);

  return {
    provider,
    title: `Запрос для ${providerName}`,
    prompt: sections.join("\n\n").slice(0, MAX_PROMPT_CHARS),
    issue_ids: issueIds,
    diagnostics: {
      source_sufficiency_status: analysis?.source_sufficiency?.status ?? null,
      external_search_required: Boolean(analysis?.external_search_required),
      external_search_reason: clean(analysis?.external_search_reason, 1200),
    },
  };
}
