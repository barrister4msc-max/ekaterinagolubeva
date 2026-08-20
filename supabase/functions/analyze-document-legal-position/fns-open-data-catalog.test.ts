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
