import {
  extractExplicitLegalEntityInns,
  loadFnsSnrFactualEvidence,
  type CompanyFactualEvidence,
} from "./fns-company-factual-evidence.ts";
import {
  loadFnsDebtamFactualEvidence,
  type CompanyTaxDebtEvidence,
} from "./fns-company-tax-debt-evidence.ts";
import {
  loadFnsRevexpFactualEvidence,
  type CompanyFinancialStatementEvidence,
} from "./fns-company-financial-statement-evidence.ts";

type SbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type DatasetRuntimeDiagnostics = {
  requested_count: number;
  loaded_count: number;
  evidence_rows: number;
  source_type: "fns_open_data";
  fact_kind: "tax_regime" | "tax_debt" | "financial_statement";
  model_input_status: "not_injected";
  legal_source_status: "excluded";
};

export type CompanyFactualRuntimeSnapshot = {
  company_factual_evidence: CompanyFactualEvidence[];
  company_tax_debt_evidence: CompanyTaxDebtEvidence[];
  company_financial_statement_evidence: CompanyFinancialStatementEvidence[];
  diagnostics: {
    explicit_legal_entity_inns: string[];
    requested_count: number;
    loaded_count: number;
    source_types: Array<"fns_open_data">;
    fact_linking_status: "not_linked";
    model_input_status: "not_injected";
    legal_source_status: "excluded";
  };
  dataset_diagnostics: {
    snr: DatasetRuntimeDiagnostics;
    debtam: DatasetRuntimeDiagnostics;
    revexp: DatasetRuntimeDiagnostics;
  };
};

function datasetDiagnostics(
  factKind: "tax_regime" | "tax_debt" | "financial_statement",
  requestedCount: number,
  evidenceRows: number,
  loadedSubjects: number,
): DatasetRuntimeDiagnostics {
  return {
    requested_count: requestedCount,
    loaded_count: loadedSubjects,
    evidence_rows: evidenceRows,
    source_type: "fns_open_data",
    fact_kind: factKind,
    model_input_status: "not_injected",
    legal_source_status: "excluded",
  };
}

/** Separate fail-soft factual channels. None is injected into legal/model paths. */
export async function loadCompanyFactualRuntimeSnapshot(input: {
  sb: SbClient;
  answers: Record<string, unknown>;
  asOfDate?: string | null;
}): Promise<CompanyFactualRuntimeSnapshot> {
  const inns = extractExplicitLegalEntityInns(input.answers);
  if (inns.length === 0) {
    return {
      company_factual_evidence: [],
      company_tax_debt_evidence: [],
      company_financial_statement_evidence: [],
      diagnostics: {
        explicit_legal_entity_inns: [], requested_count: 0, loaded_count: 0, source_types: [],
        fact_linking_status: "not_linked", model_input_status: "not_injected", legal_source_status: "excluded",
      },
      dataset_diagnostics: {
        snr: datasetDiagnostics("tax_regime", 0, 0, 0),
        debtam: datasetDiagnostics("tax_debt", 0, 0, 0),
        revexp: datasetDiagnostics("financial_statement", 0, 0, 0),
      },
    };
  }

  let snrEvidence: CompanyFactualEvidence[] = [];
  let debtEvidence: CompanyTaxDebtEvidence[] = [];
  let revexpEvidence: CompanyFinancialStatementEvidence[] = [];

  try {
    snrEvidence = await loadFnsSnrFactualEvidence({ sb: input.sb, answers: input.answers, asOfDate: input.asOfDate });
  } catch (error) {
    console.warn("fns_snr_factual_runtime_unavailable", { requested_count: inns.length, message: error instanceof Error ? error.message : String(error) });
  }
  try {
    debtEvidence = await loadFnsDebtamFactualEvidence({ sb: input.sb, answers: input.answers, asOfDate: input.asOfDate });
  } catch (error) {
    console.warn("fns_debtam_factual_runtime_unavailable", { requested_count: inns.length, message: error instanceof Error ? error.message : String(error) });
  }
  try {
    revexpEvidence = await loadFnsRevexpFactualEvidence({ sb: input.sb, answers: input.answers, asOfDate: input.asOfDate });
  } catch (error) {
    console.warn("fns_revexp_factual_runtime_unavailable", { requested_count: inns.length, message: error instanceof Error ? error.message : String(error) });
  }

  const snrSubjects = new Set(snrEvidence.map((e) => e.subject_key.inn)).size;
  const debtSubjects = new Set(debtEvidence.map((e) => e.subject_key.inn)).size;
  const revexpSubjects = new Set(revexpEvidence.map((e) => e.subject_key.inn)).size;
  const totalEvidenceRows = snrEvidence.length + debtEvidence.length + revexpEvidence.length;

  return {
    company_factual_evidence: snrEvidence,
    company_tax_debt_evidence: debtEvidence,
    company_financial_statement_evidence: revexpEvidence,
    diagnostics: {
      explicit_legal_entity_inns: inns,
      requested_count: inns.length,
      loaded_count: totalEvidenceRows,
      source_types: totalEvidenceRows > 0 ? ["fns_open_data"] : [],
      fact_linking_status: "not_linked",
      model_input_status: "not_injected",
      legal_source_status: "excluded",
    },
    dataset_diagnostics: {
      snr: datasetDiagnostics("tax_regime", inns.length, snrEvidence.length, snrSubjects),
      debtam: datasetDiagnostics("tax_debt", inns.length, debtEvidence.length, debtSubjects),
      revexp: datasetDiagnostics("financial_statement", inns.length, revexpEvidence.length, revexpSubjects),
    },
  };
}
