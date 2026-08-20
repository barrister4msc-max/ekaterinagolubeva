import {
  extractExplicitLegalEntityInns,
  loadFnsSnrFactualEvidence,
  type CompanyFactualEvidence,
} from "./fns-company-factual-evidence.ts";
import {
  loadFnsDebtamFactualEvidence,
  type CompanyTaxDebtEvidence,
} from "./fns-company-tax-debt-evidence.ts";

type SbClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type DatasetRuntimeDiagnostics = {
  requested_count: number;
  loaded_count: number;
  evidence_rows: number;
  source_type: "fns_open_data";
  fact_kind: "tax_regime" | "tax_debt";
  model_input_status: "not_injected";
  legal_source_status: "excluded";
};

export type CompanyFactualRuntimeSnapshot = {
  /** Existing SNR-only channel retained for P0-A6/P0-A7 canonical identity/matrix. */
  company_factual_evidence: CompanyFactualEvidence[];
  /** Additive DEBTAM channel. Deliberately not fed to the SNR identity/matrix. */
  company_tax_debt_evidence: CompanyTaxDebtEvidence[];
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
  };
};

function datasetDiagnostics(
  factKind: "tax_regime" | "tax_debt",
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

/**
 * Runtime boundary for official company factual evidence.
 *
 * SNR and DEBTAM are separate factual channels. SNR keeps the pre-existing
 * `company_factual_evidence` contract because P0-A6/P0-A7 canonical identity
 * and factual matrix currently understand only tax_regime evidence. DEBTAM is
 * exposed additively as `company_tax_debt_evidence`; it is never passed to that
 * SNR matrix, model prompts, legal conclusions, Source Sufficiency or Challenge.
 *
 * Each transport fails soft independently so one factual dataset cannot make
 * the legal Analyzer unavailable or suppress the other factual dataset.
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
      company_tax_debt_evidence: [],
      diagnostics: {
        explicit_legal_entity_inns: [],
        requested_count: 0,
        loaded_count: 0,
        source_types: [],
        fact_linking_status: "not_linked",
        model_input_status: "not_injected",
        legal_source_status: "excluded",
      },
      dataset_diagnostics: {
        snr: datasetDiagnostics("tax_regime", 0, 0, 0),
        debtam: datasetDiagnostics("tax_debt", 0, 0, 0),
      },
    };
  }

  let snrEvidence: CompanyFactualEvidence[] = [];
  try {
    snrEvidence = await loadFnsSnrFactualEvidence({
      sb: input.sb,
      answers: input.answers,
      asOfDate: input.asOfDate,
    });
  } catch (error) {
    console.warn("fns_snr_factual_runtime_unavailable", {
      requested_count: inns.length,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let debtEvidence: CompanyTaxDebtEvidence[] = [];
  try {
    debtEvidence = await loadFnsDebtamFactualEvidence({
      sb: input.sb,
      answers: input.answers,
      asOfDate: input.asOfDate,
    });
  } catch (error) {
    console.warn("fns_debtam_factual_runtime_unavailable", {
      requested_count: inns.length,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const snrSubjects = new Set(snrEvidence.map((evidence) => evidence.subject_key.inn)).size;
  const debtSubjects = new Set(debtEvidence.map((evidence) => evidence.subject_key.inn)).size;
  const totalEvidenceRows = snrEvidence.length + debtEvidence.length;

  return {
    company_factual_evidence: snrEvidence,
    company_tax_debt_evidence: debtEvidence,
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
    },
  };
}
