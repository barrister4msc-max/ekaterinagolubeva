import {
  extractExplicitLegalEntityInns,
  loadFnsSnrFactualEvidence,
  type CompanyFactualEvidence,
} from "./fns-company-factual-evidence.ts";

type SbClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type CompanyFactualRuntimeSnapshot = {
  company_factual_evidence: CompanyFactualEvidence[];
  diagnostics: {
    explicit_legal_entity_inns: string[];
    requested_count: number;
    loaded_count: number;
    source_types: Array<"fns_open_data">;
    fact_linking_status: "not_linked";
    model_input_status: "not_injected";
    legal_source_status: "excluded";
  };
};

/**
 * P0-A4/P0-A5 runtime boundary for company factual evidence.
 *
 * This loader is intentionally NOT a legal research provider. It may be called
 * by the Analyzer orchestration after answers are loaded, but the returned
 * evidence remains outside RawSource / TrustedSource and is not injected into
 * the LLM prompt, conclusions, Evidence Matrix, Source Sufficiency or Challenge
 * until an explicit fact↔factual-evidence identity contract is separately
 * implemented and verified.
 *
 * Transport exceptions are fail-soft: legal analysis must continue without the
 * factual snapshot rather than turning FNS availability into an Analyzer SPOF.
 * The existing diagnostics shape is intentionally preserved; this layer cannot
 * reliably distinguish "no row" from an RPC error because the lower adapter is
 * already fail-closed and maps both to no evidence.
 */
export async function loadCompanyFactualRuntimeSnapshot(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyFactualRuntimeSnapshot> {
  const inns = extractExplicitLegalEntityInns(input.answers);
  if (inns.length === 0) {
    return {
      company_factual_evidence: [],
      diagnostics: {
        explicit_legal_entity_inns: [],
        requested_count: 0,
        loaded_count: 0,
        source_types: [],
        fact_linking_status: "not_linked",
        model_input_status: "not_injected",
        legal_source_status: "excluded",
      },
    };
  }

  let evidence: CompanyFactualEvidence[];
  try {
    evidence = await loadFnsSnrFactualEvidence({
      sb: input.sb,
      answers: input.answers,
      asOfDate: input.asOfDate,
    });
  } catch (error) {
    console.warn("fns_company_factual_runtime_unavailable", {
      requested_count: inns.length,
      message: error instanceof Error ? error.message : String(error),
    });
    evidence = [];
  }

  return {
    company_factual_evidence: evidence,
    diagnostics: {
      explicit_legal_entity_inns: inns,
      requested_count: inns.length,
      loaded_count: evidence.length,
      source_types: evidence.length > 0 ? ["fns_open_data"] : [],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    },
  };
}
