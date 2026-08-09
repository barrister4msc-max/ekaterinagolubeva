export type TemplateRegistryEntry = {
  code: string;
  title: string;
  category: string;
  subcategory: string | null;
  practice_area: string | null;
  jurisdiction: string[];
  languages: string[];
  complexity: "basic" | "advanced" | "expert";
  is_active: boolean;
  requires_intake: boolean;
  description: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type TemplateLookupResult =
  | { status: "found"; template: TemplateRegistryEntry }
  | { status: "not_found"; code: string }
  | { status: "error"; code: string; error: unknown };

type TemplateRegistryClient = {
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: TemplateRegistryEntry | null;
          error: unknown | null;
        }>;
      };
    };
  };
};

const TEMPLATE_COLUMNS = [
  "code",
  "title",
  "category",
  "subcategory",
  "practice_area",
  "jurisdiction",
  "languages",
  "complexity",
  "is_active",
  "requires_intake",
  "description",
  "sort_order",
  "metadata",
].join(", ");

export async function getTemplateByCode(
  client: TemplateRegistryClient,
  code: string,
): Promise<TemplateLookupResult> {
  try {
    const { data, error } = await client
      .from("legal_document_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("code", code)
      .maybeSingle();

    if (error) return { status: "error", code, error };
    if (!data) return { status: "not_found", code };
    return { status: "found", template: data };
  } catch (error) {
    return { status: "error", code, error };
  }
}
