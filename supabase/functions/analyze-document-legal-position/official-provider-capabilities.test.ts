import { describe, expect, test } from "bun:test";
import {
  OFFICIAL_PROVIDER_REGISTRY,
  evaluateOfficialSourceSafety,
  getOfficialProviderRegistration,
  isDirectBackendAllowed,
  isOfficialLegalUrl,
} from "./official-sources.ts";

describe("Official Provider Capability Registry", () => {
  test("registers the six approved official provider identities", () => {
    expect(OFFICIAL_PROVIDER_REGISTRY.map((provider) => provider.id)).toEqual([
      "pravo",
      "fns",
      "minfin",
      "vsrf",
      "kad",
      "kremlin",
    ]);
  });

  test("only Pravo is currently allowed for direct backend machine access", () => {
    expect(isDirectBackendAllowed("pravo")).toBe(true);
    expect(isDirectBackendAllowed("fns")).toBe(false);
    expect(isDirectBackendAllowed("minfin")).toBe(false);
    expect(isDirectBackendAllowed("vsrf")).toBe(false);
    expect(isDirectBackendAllowed("kad")).toBe(false);
    expect(isDirectBackendAllowed("kremlin")).toBe(false);
  });

  test("public web interfaces do not imply a documented machine interface", () => {
    for (const id of ["fns", "vsrf", "kad", "kremlin"] as const) {
      const provider = getOfficialProviderRegistration(id);
      expect(provider.official_public_interface).toBe(true);
      expect(provider.documented_machine_interface).toBe(false);
      expect(provider.machine_readable_search).toBe(false);
      expect(provider.direct_backend_allowed).toBe(false);
    }
  });

  test("Minfin remains fail-closed until its public/documented interface is separately verified", () => {
    const minfin = getOfficialProviderRegistration("minfin");
    expect(minfin.official_public_interface).toBe(false);
    expect(minfin.documented_machine_interface).toBe(false);
    expect(minfin.machine_readable_search).toBe(false);
    expect(minfin.direct_backend_allowed).toBe(false);
  });

  test("Kremlin URLs are official-origin candidates but not substantive merely because the host is official", () => {
    const url = "https://kremlin.ru/acts/bank/51001";
    expect(isOfficialLegalUrl(url)).toBe(true);
    expect(isOfficialLegalUrl("https://kremlin.ru.evil.example/acts/bank/51001")).toBe(false);

    const safety = evaluateOfficialSourceSafety({
      officialUrl: url,
      identityVerified: true,
      contentVerified: false,
      actualityStatus: "unknown",
    });

    expect(safety.official_origin_verified).toBe(true);
    expect(safety.document_identity_verified).toBe(true);
    expect(safety.content_verified).toBe(false);
    expect(safety.substantive_use_allowed).toBe(false);
    expect(safety.verification_level).toBe("identity");
  });
});
