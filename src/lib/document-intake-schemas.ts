import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// TYPES — Intake Schema
// ============================================================================

export type IntakeFieldType =
  // basic
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "multiselect"
  // legal
  | "party_list"
  | "share_structure"
  | "clause_options"
  // international
  | "company_data"
  | "person_data"
  | "country"
  | "jurisdiction"
  // financial
  | "money"
  | "percentage"
  // contacts
  | "email"
  | "phone"
  | "address"
  // documents
  | "file_upload";

export const ALL_FIELD_TYPES: IntakeFieldType[] = [
  "text", "textarea", "number", "date", "boolean", "select", "multiselect",
  "party_list", "share_structure", "clause_options",
  "company_data", "person_data", "country", "jurisdiction",
  "money", "percentage",
  "email", "phone", "address",
  "file_upload",
];

export type IntakeFieldOption = {
  value: string;
  label: string;
  description?: string;
};

export type IntakeField = {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: IntakeFieldOption[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  currency?: string;
  multiline?: boolean;
  /** Free-form metadata for renderer / AI prompt. */
  meta?: Record<string, unknown>;
};

export type IntakeStep = {
  id: string;
  title: string;
  description?: string;
  fields: IntakeField[];
};

export type IntakeSchemaJson = {
  version?: string;
  steps: IntakeStep[];
  /** Optional advisory warnings shown on the final preview. */
  warnings?: string[];
};

export type DocumentIntakeSchema = {
  id: string;
  template_code: string;
  jurisdiction: string | null;
  language: string;
  title: string;
  description: string | null;
  is_active: boolean;
  required_fields: string[];
  schema_json: IntakeSchemaJson;
  sort_order: number;
  metadata: Record<string, unknown>;
};

// ============================================================================
// TYPES — Intake State (will be reused by AI generation)
// ============================================================================

export type GenerationMode = "standalone" | "matter_based" | "hybrid";

export type IntakeAttachment = {
  id: string;
  fieldKey?: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  /** Storage path or URL once uploaded. */
  storagePath?: string;
};

export type IntakeAnswers = Record<string, unknown>;

export type IntakeState = {
  templateCode: string;
  category: string;
  jurisdiction: string;
  language: string;
  generationMode: GenerationMode;
  answers: IntakeAnswers;
  attachments: IntakeAttachment[];
  specialInstructions: string;
};

export function createInitialIntakeState(params: {
  templateCode: string;
  category: string;
  jurisdiction: string;
  language: string;
  generationMode?: GenerationMode;
}): IntakeState {
  return {
    templateCode: params.templateCode,
    category: params.category,
    jurisdiction: params.jurisdiction,
    language: params.language,
    generationMode: params.generationMode ?? "standalone",
    answers: {},
    attachments: [],
    specialInstructions: "",
  };
}

// ============================================================================
// DATA ACCESS
// ============================================================================

const TABLE = "document_intake_schemas";

function mapRow(row: Record<string, unknown>): DocumentIntakeSchema {
  return {
    id: row.id as string,
    template_code: row.template_code as string,
    jurisdiction: (row.jurisdiction as string | null) ?? null,
    language: (row.language as string) ?? "ru",
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    is_active: Boolean(row.is_active),
    required_fields: (row.required_fields as string[] | null) ?? [],
    schema_json: ((row.schema_json as IntakeSchemaJson | null) ?? { steps: [] }),
    sort_order: (row.sort_order as number) ?? 0,
    metadata: ((row.metadata as Record<string, unknown> | null) ?? {}),
  };
}

/**
 * Returns the first active intake schema for the template using fallback chain:
 *   1. template_code + jurisdiction + language
 *   2. template_code + jurisdiction (any language)
 *   3. template_code + language (jurisdiction IS NULL)
 *   4. template_code + default (jurisdiction IS NULL, any language)
 */
export async function getIntakeSchema(
  templateCode: string,
  jurisdiction?: string | null,
  language?: string | null,
): Promise<DocumentIntakeSchema | null> {
  // Pull all active schemas for this template and resolve in JS — single query, predictable fallback.
  // Using @ts-expect-error is unnecessary; document_intake_schemas exists in generated types.
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("template_code", templateCode)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  if (rows.length === 0) return null;

  const j = jurisdiction || null;
  const l = language || null;

  const pick = (predicate: (s: DocumentIntakeSchema) => boolean) =>
    rows.find(predicate) ?? null;

  // 1. exact: jurisdiction + language
  if (j && l) {
    const found = pick((s) => s.jurisdiction === j && s.language === l);
    if (found) return found;
  }
  // 2. jurisdiction only
  if (j) {
    const found = pick((s) => s.jurisdiction === j);
    if (found) return found;
  }
  // 3. language + default jurisdiction
  if (l) {
    const found = pick((s) => s.jurisdiction === null && s.language === l);
    if (found) return found;
  }
  // 4. default
  return pick((s) => s.jurisdiction === null);
}

export async function getActiveIntakeSchemas(): Promise<DocumentIntakeSchema[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("is_active", true)
    .order("template_code", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

// ============================================================================
// VALIDATION
// ============================================================================

export type IntakeValidationIssue = {
  fieldKey: string;
  stepId?: string;
  message: string;
};

export type IntakeValidationResult = {
  valid: boolean;
  issues: IntakeValidationIssue[];
};

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function validateField(field: IntakeField, value: unknown): string | null {
  const required = Boolean(field.required);
  if (isEmpty(value)) return required ? "Обязательное поле" : null;

  switch (field.type) {
    case "number":
    case "money":
    case "percentage": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) return "Должно быть числом";
      if (field.min !== undefined && n < field.min) return `Минимум ${field.min}`;
      if (field.max !== undefined && n > field.max) return `Максимум ${field.max}`;
      if (field.type === "percentage" && (n < 0 || n > 100)) return "Должно быть от 0 до 100";
      return null;
    }
    case "email": {
      const s = String(value).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "Некорректный email";
      return null;
    }
    case "phone": {
      const s = String(value).replace(/[\s()\-]/g, "");
      if (!/^\+?\d{6,20}$/.test(s)) return "Некорректный телефон";
      return null;
    }
    case "date": {
      const s = String(value);
      if (Number.isNaN(Date.parse(s))) return "Некорректная дата";
      return null;
    }
    case "select": {
      if (field.options && !field.options.some((o) => o.value === value)) {
        return "Недопустимое значение";
      }
      return null;
    }
    case "multiselect": {
      if (!Array.isArray(value)) return "Ожидается список";
      if (field.options) {
        const allowed = new Set(field.options.map((o) => o.value));
        for (const v of value) if (!allowed.has(String(v))) return "Недопустимое значение";
      }
      return null;
    }
    case "party_list": {
      if (!Array.isArray(value) || value.length === 0) {
        return required ? "Укажите хотя бы одну сторону" : null;
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateIntake(
  schema: DocumentIntakeSchema,
  answers: IntakeAnswers,
): IntakeValidationResult {
  const issues: IntakeValidationIssue[] = [];
  const requiredSet = new Set(schema.required_fields ?? []);

  for (const step of schema.schema_json?.steps ?? []) {
    for (const field of step.fields) {
      const effective: IntakeField = {
        ...field,
        required: field.required || requiredSet.has(field.key),
      };
      const err = validateField(effective, answers[field.key]);
      if (err) issues.push({ fieldKey: field.key, stepId: step.id, message: err });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function getMissingRequiredFields(
  schema: DocumentIntakeSchema,
  answers: IntakeAnswers,
): IntakeField[] {
  const requiredSet = new Set(schema.required_fields ?? []);
  const missing: IntakeField[] = [];
  for (const step of schema.schema_json?.steps ?? []) {
    for (const field of step.fields) {
      const isRequired = field.required || requiredSet.has(field.key);
      if (!isRequired) continue;
      if (isEmpty(answers[field.key])) missing.push(field);
    }
  }
  return missing;
}

// ============================================================================
// FIELD METADATA — labels for renderer
// ============================================================================

export const FIELD_TYPE_LABELS: Record<IntakeFieldType, string> = {
  text: "Строка",
  textarea: "Текст",
  number: "Число",
  date: "Дата",
  boolean: "Да/Нет",
  select: "Выбор",
  multiselect: "Множественный выбор",
  party_list: "Стороны договора",
  share_structure: "Структура долей",
  clause_options: "Опции условий",
  company_data: "Данные компании",
  person_data: "Данные физлица",
  country: "Страна",
  jurisdiction: "Юрисдикция",
  money: "Сумма",
  percentage: "Процент",
  email: "Email",
  phone: "Телефон",
  address: "Адрес",
  file_upload: "Файл",
};
