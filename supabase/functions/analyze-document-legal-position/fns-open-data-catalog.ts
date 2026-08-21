export type FnsOpenDataFormat = "xml_zip" | "csv";

export type FnsOpenDataDataset = {
  id: string;
  title: string;
  landing_url: string;
  data_url: string;
  schema_url: string;
  format: FnsOpenDataFormat;
  entity_scope: "legal_entity" | "individual_entrepreneur" | "aggregate_statistics";
  fact_kind:
    | "headcount"
    | "tax_debt"
    | "tax_regime"
    | "tax_offence"
    | "financial_statement";
  source_family: "factual_official_data";
  official_owner: "ФНС России";
  legal_authority: false;
  substantive_use_allowed: false;
  data_as_of: string;
  published_at: string;
};

/**
 * Curated, documented, public FNS Open Data releases suitable for controlled
 * factual-data ingestion. These are not legal norms or legal authority.
 *
 * URLs are pinned to an explicit release/schema pair so a future updater must
 * detect and review a new release instead of silently changing the parser
 * contract underneath an existing import.
 */
export const FNS_OPEN_DATA_DATASETS: readonly FnsOpenDataDataset[] = [
  {
    id: "7707329152-sshr2019",
    title: "Сведения о среднесписочной численности работников организации",
    landing_url: "https://www.nalog.gov.ru/opendata/7707329152-sshr2019/",
    data_url: "https://file.nalog.ru/opendata/7707329152-sshr2019/data-20260625-structure-20200408.zip",
    schema_url: "https://file.nalog.ru/opendata/7707329152-sshr2019/structure-20200408.xsd",
    format: "xml_zip",
    entity_scope: "legal_entity",
    fact_kind: "headcount",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    legal_authority: false,
    substantive_use_allowed: false,
    data_as_of: "2025-12-31",
    published_at: "2026-06-25",
  },
  {
    id: "7707329152-debtam",
    title: "Сведения о суммах задолженности по уплате налогов, сборов, страховых взносов, пеней и штрафов",
    landing_url: "https://www.nalog.gov.ru/opendata/7707329152-debtam/",
    data_url: "https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip",
    schema_url: "https://file.nalog.ru/opendata/7707329152-debtam/structure-20181201.xsd",
    format: "xml_zip",
    entity_scope: "legal_entity",
    fact_kind: "tax_debt",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    legal_authority: false,
    substantive_use_allowed: false,
    data_as_of: "2026-07-01",
    published_at: "2026-07-25",
  },
  {
    id: "7707329152-snr",
    title: "Сведения о специальных налоговых режимах, применяемых налогоплательщиками",
    landing_url: "https://www.nalog.gov.ru/opendata/7707329152-snr/",
    data_url: "https://file.nalog.ru/opendata/7707329152-snr/data-20260625-structure-20230425.zip",
    schema_url: "https://file.nalog.ru/opendata/7707329152-snr/structure-20230425.xsd",
    format: "xml_zip",
    entity_scope: "legal_entity",
    fact_kind: "tax_regime",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    legal_authority: false,
    substantive_use_allowed: false,
    data_as_of: "2026-06-01",
    published_at: "2026-06-25",
  },
  {
    id: "7707329152-taxoffence",
    title: "Сведения о налоговых правонарушениях и мерах ответственности за их совершение",
    landing_url: "https://www.nalog.gov.ru/opendata/7707329152-taxoffence/",
    data_url: "https://data.nalog.ru/opendata/7707329152-taxoffence/data-20251201-structure-20191201.zip",
    schema_url: "https://data.nalog.ru/opendata/7707329152-taxoffence/structure-20181201.xsd",
    format: "xml_zip",
    entity_scope: "legal_entity",
    fact_kind: "tax_offence",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    legal_authority: false,
    substantive_use_allowed: false,
    data_as_of: "2024-12-31",
    published_at: "2025-12-01",
  },
  {
    id: "7707329152-revexp",
    title: "Сведения о суммах доходов и расходов по данным бухгалтерской (финансовой) отчетности организации за год, предшествующий году размещения таких сведений на сайте ФНС России",
    landing_url: "https://www.nalog.gov.ru/opendata/7707329152-revexp/",
    data_url: "https://file.nalog.ru/opendata/7707329152-revexp/data-20260725-structure-20180110.zip",
    schema_url: "https://file.nalog.ru/opendata/7707329152-revexp/structure-20180110.xsd",
    format: "xml_zip",
    entity_scope: "legal_entity",
    fact_kind: "financial_statement",
    source_family: "factual_official_data",
    official_owner: "ФНС России",
    legal_authority: false,
    substantive_use_allowed: false,
    data_as_of: "2025-12-31",
    published_at: "2026-07-25",
  },
] as const;

const ALLOWED_HOSTS = new Set(["www.nalog.gov.ru", "data.nalog.ru", "file.nalog.ru"]);

export function validateFnsOpenDataCatalog(
  datasets: readonly FnsOpenDataDataset[] = FNS_OPEN_DATA_DATASETS,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const dataset of datasets) {
    if (ids.has(dataset.id)) errors.push(`duplicate_dataset_id:${dataset.id}`);
    ids.add(dataset.id);

    for (const [field, value] of [
      ["landing_url", dataset.landing_url],
      ["data_url", dataset.data_url],
      ["schema_url", dataset.schema_url],
    ] as const) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") errors.push(`${dataset.id}:${field}:https_required`);
        if (!ALLOWED_HOSTS.has(url.hostname)) errors.push(`${dataset.id}:${field}:host_not_allowed:${url.hostname}`);
      } catch {
        errors.push(`${dataset.id}:${field}:invalid_url`);
      }
    }

    if (dataset.source_family !== "factual_official_data") errors.push(`${dataset.id}:wrong_source_family`);
    if (dataset.legal_authority !== false) errors.push(`${dataset.id}:must_not_be_legal_authority`);
    if (dataset.substantive_use_allowed !== false) errors.push(`${dataset.id}:must_fail_closed`);
  }

  return errors;
}

export type FnsOpenDataImportPlan = {
  dataset_id: string;
  data_url: string;
  schema_url: string;
  parser: "zip_xml_xsd" | "csv";
  source_type: "fns_open_data";
  source_family: "factual_official_data";
  factual_only: true;
  legal_authority: false;
  substantive_use_allowed: false;
};

/** Pure dry-run planning only. No network or DB writes. */
export function buildFnsOpenDataImportPlan(dataset: FnsOpenDataDataset): FnsOpenDataImportPlan {
  return {
    dataset_id: dataset.id,
    data_url: dataset.data_url,
    schema_url: dataset.schema_url,
    parser: dataset.format === "xml_zip" ? "zip_xml_xsd" : "csv",
    source_type: "fns_open_data",
    source_family: "factual_official_data",
    factual_only: true,
    legal_authority: false,
    substantive_use_allowed: false,
  };
}
