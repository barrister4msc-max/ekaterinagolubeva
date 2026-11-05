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
        maybeSingle: () => PromiseLike<{
          data: unknown;
          error: unknown | null;
        }>;
      };
    };
  };
};

function isTemplateRegistryEntry(value:unknown):value is TemplateRegistryEntry {
  if(!value || typeof value!=="object" || Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  const nullableString=(key:string)=>row[key]===null || typeof row[key]==="string";
  const strings=(key:string)=>Array.isArray(row[key]) && row[key].every(v=>typeof v==="string");
  return ["code","title","category"].every(key=>typeof row[key]==="string") &&
    ["subcategory","practice_area","description"].every(nullableString) && strings("jurisdiction") && strings("languages") &&
    typeof row.complexity==="string" && ["basic","advanced","expert"].includes(row.complexity) && typeof row.is_active==="boolean" && typeof row.requires_intake==="boolean" &&
    typeof row.sort_order==="number" && Number.isFinite(row.sort_order) && Boolean(row.metadata) && typeof row.metadata==="object" && !Array.isArray(row.metadata);
}

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
    if(!isTemplateRegistryEntry(data) || data.code!==code)return {status:"error",code,error:new Error("invalid_template_registry_entry")};
    return { status: "found", template: data };
  } catch (error) {
    return { status: "error", code, error };
  }
}
