import type { ExternalResearchImportInput } from "./external-research-import.ts";

export type BrasKadBrowserHandoff = {
  provider_id: "bras_kad";
  mode: "browser_handoff";
  case_number: string;
  official_search_url: string;
  source_only: true;
  substantive_use_allowed: false;
};

function normalizeCaseNumber(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase() : "";
  return /^А\d+-\d+\/\d{4}$/u.test(normalized) ? normalized : null;
}

/**
 * Creates a public KAD browser handoff and its existing import-contract input.
 * It never fetches KAD, parses a page, or represents the reference as authority.
 */
export function buildBrasKadBrowserHandoff(value: unknown): {
  handoff: BrasKadBrowserHandoff;
  import_input: ExternalResearchImportInput;
} | null {
  const caseNumber = normalizeCaseNumber(value);
  if (!caseNumber) return null;
  const officialSearchUrl = `https://kad.arbitr.ru/Card?number=${encodeURIComponent(caseNumber)}`;
  return {
    handoff: {
      provider_id: "bras_kad",
      mode: "browser_handoff",
      case_number: caseNumber,
      official_search_url: officialSearchUrl,
      source_only: true,
      substantive_use_allowed: false,
    },
    import_input: {
      provider: "bras_kad",
      candidates: [{
        title: `Арбитражное дело ${caseNumber}`,
        url: officialSearchUrl,
        case_number: caseNumber,
        bucket: "court_practice",
        source_type: "court_external_reference",
      }],
    },
  };
}
