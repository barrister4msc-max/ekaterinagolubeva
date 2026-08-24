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
import {
  loadFnsSshr2019FactualEvidence,
  type CompanyAverageHeadcountEvidence,
} from "./fns-company-headcount-evidence.ts";
import {
  loadFnsTaxOffenceFactualEvidence,
  type CompanyTaxOffenceEvidence,
} from "./fns-company-tax-offence-evidence.ts";

type SbClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type DatasetRuntimeDiagnostics = {
  requested_count: number;
  loaded_count: number;
  evidence_rows: number;
  source_type: "fns_open_data";
  fact_kind: "tax_regime" | "tax_debt" | "financial_statement" | "headcount" | "tax_offence_record";
  model_input_status: "not_injected";
  legal_source_status: "excluded";
};

export type CompanyFactualRuntimeSnapshot = {
  company_factual_evidence: CompanyFactualEvidence[];
  company_tax_debt_evidence: CompanyTaxDebtEvidence[];
  company_financial_statement_evidence: CompanyFinancialStatementEvidence[];
  company_average_headcount_evidence: CompanyAverageHeadcountEvidence[];
  company_tax_offence_evidence: CompanyTaxOffenceEvidence[];
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
    sshr2019: DatasetRuntimeDiagnostics;
    taxoffence: DatasetRuntimeDiagnostics;
  };
};

function datasetDiagnostics(
  factKind: "tax_regime" | "tax_debt" | "financial_statement" | "headcount" | "tax_offence_record",
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
      company_average_headcount_evidence: [],
      company_tax_offence_evidence: [],
      diagnostics: {
        explicit_legal_entity_inns: [], requested_count: 0, loaded_count: 0, source_types: [],
        fact_linking_status: "not_linked", model_input_status: "not_injected", legal_source_status: "excluded",
      },
      dataset_diagnostics: {
        snr: datasetDiagnostics("tax_regime", 0, 0, 0),
        debtam: datasetDiagnostics("tax_debt", 0, 0, 0),
        revexp: datasetDiagnostics("financial_statement", 0, 0, 0),
        sshr2019: datasetDiagnostics("headcount", 0, 0, 0),
        taxoffence: datasetDiagnostics("tax_offence_record", 0, 0, 0),
      },
    };
  }

  let snrEvidence: CompanyFactualEvidence[] = [];
  let debtEvidence: CompanyTaxDebtEvidence[] = [];
  let revexpEvidence: CompanyFinancialStatementEvidence[] = [];
  let headcountEvidence: CompanyAverageHeadcountEvidence[] = [];
  let taxOffenceEvidence: CompanyTaxOffenceEvidence[] = [];

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
  try {
    headcountEvidence = await loadFnsSshr2019FactualEvidence({ sb: input.sb, answers: input.answers, asOfDate: input.asOfDate });
  } catch (error) {
    console.warn("fns_sshr2019_factual_runtime_unavailable", { requested_count: inns.length, message: error instanceof Error ? error.message : String(error) });
  }

  try {
    taxOffenceEvidence = await loadFnsTaxOffenceFactualEvidence({ sb: input.sb, answers: input.answers, asOfDate: input.asOfDate });
  } catch (error) {
    console.warn("fns_taxoffence_factual_runtime_unavailable", { requested_count: inns.length, message: error instanceof Error ? error.message : String(error) });
  }

  const snrSubjects = new Set(snrEvidence.map((e) => e.subject_key.inn)).size;
  const debtSubjects = new Set(debtEvidence.map((e) => e.subject_key.inn)).size;
  const revexpSubjects = new Set(revexpEvidence.map((e) => e.subject_key.inn)).size;
  const headcountSubjects = new Set(headcountEvidence.map((e) => e.subject_key.inn)).size;
  const taxOffenceSubjects = new Set(taxOffenceEvidence.map((e) => e.subject_key.inn)).size;
  const totalEvidenceRows = snrEvidence.length + debtEvidence.length + revexpEvidence.length + headcountEvidence.length + taxOffenceEvidence.length;

  return {
    company_factual_evidence: snrEvidence,
    company_tax_debt_evidence: debtEvidence,
    company_financial_statement_evidence: revexpEvidence,
    company_average_headcount_evidence: headcountEvidence,
    company_tax_offence_evidence: taxOffenceEvidence,
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
      sshr2019: datasetDiagnostics("headcount", inns.length, headcountEvidence.length, headcountSubjects),
      taxoffence: datasetDiagnostics("tax_offence_record", inns.length, taxOffenceEvidence.length, taxOffenceSubjects),
    },
  };
}
