import { describe, expect, test } from "bun:test";
import { buildBrasKadBrowserHandoff } from "./bras-kad-browser-handoff.ts";

describe("BRAS/KAD browser source handoff", () => {
  test("creates an official source-only handoff for a public arbitration case", () => {
    const result = buildBrasKadBrowserHandoff(" А40-12345/2024 ");
    expect(result?.handoff).toMatchObject({
      provider_id: "bras_kad", mode: "browser_handoff", case_number: "А40-12345/2024",
      source_only: true, substantive_use_allowed: false,
    });
    expect(result?.handoff.official_search_url).toContain("kad.arbitr.ru/Card?number=");
    expect(result?.import_input.candidates?.[0]).toMatchObject({
      bucket: "court_practice", case_number: "А40-12345/2024",
    });
  });

  test("rejects arbitrary text and never creates a provider request", () => {
    expect(buildBrasKadBrowserHandoff("ООО Секретный клиент")).toBeNull();
  });
});
