import { describe, expect, test } from "bun:test";
import {
  FNS_OPEN_DATA_DATASETS,
  buildFnsOpenDataImportPlan,
  validateFnsOpenDataCatalog,
} from "./fns-open-data-catalog.ts";

describe("FNS Open Data catalog", () => {
  test("catalog is pinned, official-host-only and fail-closed", () => {
    expect(validateFnsOpenDataCatalog()).toEqual([]);
    expect(FNS_OPEN_DATA_DATASETS.length).toBe(5);

    for (const dataset of FNS_OPEN_DATA_DATASETS) {
      expect(dataset.source_family).toBe("factual_official_data");
      expect(dataset.official_owner).toBe("ФНС России");
      expect(dataset.legal_authority).toBe(false);
      expect(dataset.substantive_use_allowed).toBe(false);
      expect(dataset.data_url).toMatch(/^https:\/\/(file|data)\.nalog\.ru\/opendata\//);
      expect(dataset.schema_url).toMatch(/^https:\/\/(file|data)\.nalog\.ru\/opendata\//);
    }
  });

  test("SNR is pinned to the verified June 2026 release", () => {
    const snr = FNS_OPEN_DATA_DATASETS.find((dataset) => dataset.id === "7707329152-snr");
    expect(snr).toBeDefined();
    expect(snr?.data_url).toBe(
      "https://file.nalog.ru/opendata/7707329152-snr/data-20260625-structure-20230425.zip",
    );
    expect(snr?.schema_url).toBe(
      "https://file.nalog.ru/opendata/7707329152-snr/structure-20230425.xsd",
    );
    expect(snr?.data_as_of).toBe("2026-06-01");
    expect(snr?.published_at).toBe("2026-06-25");
  });

  test("DEBTAM is refreshed to the official July 2026 release", () => {
    const debtam = FNS_OPEN_DATA_DATASETS.find((dataset) => dataset.id === "7707329152-debtam");
    expect(debtam).toBeDefined();
    expect(debtam?.fact_kind).toBe("tax_debt");
    expect(debtam?.entity_scope).toBe("legal_entity");
    expect(debtam?.data_url).toBe(
      "https://file.nalog.ru/opendata/7707329152-debtam/data-20260725-structure-20181201.zip",
    );
    expect(debtam?.schema_url).toBe(
      "https://file.nalog.ru/opendata/7707329152-debtam/structure-20181201.xsd",
    );
    expect(debtam?.data_as_of).toBe("2026-07-01");
    expect(debtam?.published_at).toBe("2026-07-25");
    expect(debtam?.legal_authority).toBe(false);
    expect(debtam?.substantive_use_allowed).toBe(false);
  });

  test("dry-run plan never promotes factual data into legal authority", () => {
    for (const dataset of FNS_OPEN_DATA_DATASETS) {
      const plan = buildFnsOpenDataImportPlan(dataset);
      expect(plan.source_type).toBe("fns_open_data");
      expect(plan.source_family).toBe("factual_official_data");
      expect(plan.factual_only).toBe(true);
      expect(plan.legal_authority).toBe(false);
      expect(plan.substantive_use_allowed).toBe(false);
    }
  });

  test("rejects non-FNS transport hosts", () => {
    const tampered = [{
      ...FNS_OPEN_DATA_DATASETS[0],
      data_url: "https://example.com/fns.zip",
    }];
    expect(validateFnsOpenDataCatalog(tampered)).toContain(
      `${FNS_OPEN_DATA_DATASETS[0].id}:data_url:host_not_allowed:example.com`,
    );
  });
});
