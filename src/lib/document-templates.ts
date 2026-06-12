import { supabase } from "@/integrations/supabase/client";

export type TemplateComplexity = "basic" | "advanced" | "expert";

export type DocumentTemplate = {
  id: string;
  code: string;
  title: string;
  category: string;
  subcategory: string | null;
  practice_area: string | null;
  jurisdiction: string[];
  languages: string[];
  complexity: TemplateComplexity;
  is_active: boolean;
  requires_intake: boolean;
  description: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

const TABLE = "legal_document_templates";

export async function getTemplates(): Promise<DocumentTemplate[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentTemplate[];
}

export async function getTemplateByCode(code: string): Promise<DocumentTemplate | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as DocumentTemplate) ?? null;
}

export async function getTemplatesByCategory(category: string): Promise<DocumentTemplate[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .eq("category", category)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentTemplate[];
}

export async function searchTemplates(query: string): Promise<DocumentTemplate[]> {
  const q = query.trim();
  if (!q) return getTemplates();
  const like = `%${q}%`;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .or(
      `title.ilike.${like},category.ilike.${like},subcategory.ilike.${like},code.ilike.${like}`,
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentTemplate[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: "Общие юридические документы",
  CONTRACTS: "Договоры",
  REAL_ESTATE: "Недвижимость",
  COURT: "Судебные",
  TAX: "Налоговые",
  CORPORATE: "Корпоративные (РФ)",
  INTERNATIONAL_CORPORATE: "Международные корпоративные",
  COMPLIANCE: "Комплаенс и политики",
  LABOUR: "Трудовые",
  FAMILY: "Семейные",
  INHERITANCE: "Наследственные",
  LAND: "Земельные",
  BANKRUPTCY: "Банкротство",
  CONSUMER: "Защита прав потребителей",
  ENFORCEMENT: "Исполнительное производство",
};

export const PRACTICE_AREA_LABELS: Record<string, string> = {
  general: "Общая практика",
  contracts: "Договоры",
  real_estate: "Недвижимость",
  litigation: "Судебные споры",
  tax: "Налоги",
  corporate: "Корпоративное (РФ)",
  international_corporate: "Международное корпоративное",
  it: "IT / IP",
  compliance: "Комплаенс",
  labour: "Трудовое",
  logistics: "Логистика",
  family: "Семейное",
  inheritance: "Наследственное",
  land: "Земельное",
  bankruptcy: "Банкротство",
  consumer: "Защита прав потребителей",
  enforcement: "Исполнительное производство",
};

export const JURISDICTION_LABELS: Record<string, string> = {
  RU: "Россия",
  CY: "Кипр",
  IL: "Израиль",
  GE: "Грузия",
};

export const LANGUAGE_LABELS: Record<string, string> = {
  ru: "Русский",
  en: "Английский",
  he: "Иврит",
  ka: "Грузинский",
};

export const COMPLEXITY_LABELS: Record<TemplateComplexity, string> = {
  basic: "Базовый",
  advanced: "Продвинутый",
  expert: "Экспертный",
};
