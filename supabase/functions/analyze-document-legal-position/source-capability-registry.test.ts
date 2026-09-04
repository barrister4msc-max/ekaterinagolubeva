import { describe, expect, test } from "bun:test";
import {
  createSourceCapabilityRegistry,
  resolveSourceCapability,
  SOURCE_CAPABILITY_REGISTRY,
  type SourceCapabilityRegistration,
} from "./source-capability-registry.ts";

describe("Prompt 08H provider-neutral Source Capability Registry", () => {
  test("describes active, shadow, manual, blocked and degraded routes without executing one", () => {
    const expected = [
      ["law7_local", "laws", "active"],
      ["bras_kad_api_cloud", "court_practice", "shadow_retrieval"],
      ["bras_kad", "court_practice", "manual_import_only"],
      ["fns_official", "fns_letters", "blocked"],
      ["vsrf_official", "court_practice", "degraded"],
    ] as const;

    for (const [provider_id, source_family, status] of expected) {
      const route = resolveSourceCapability({ provider_id, source_family });
      expect(route.status).toBe(status);
      expect(route.executable).toBe(false);
      expect(route.substantive_use_allowed).toBe(false);
      expect(route.capability?.substantive_use_allowed_by_provider).toBe(false);
    }
  });

  test("fails closed for unknown providers and unsupported source families", () => {
    expect(resolveSourceCapability({ provider_id: "unknown", source_family: "laws" }).status).toBe("unknown_provider");
    expect(resolveSourceCapability({ provider_id: "pravo", source_family: "court_practice" }).status)
      .toBe("unsupported_source_family");
  });

  test("detects a requested transport version that differs from the registered route", () => {
    const result = resolveSourceCapability({
      provider_id: "pravo", source_family: "laws", transport_version: "other-v2",
    });
    expect(result.status).toBe("transport_version_drift");
    expect(result.executable).toBe(false);
  });

  test("preserves a disabled capability as non-executable", () => {
    const base = SOURCE_CAPABILITY_REGISTRY.find((route) => route.provider_id === "law7_local");
    if (!base) throw new Error("missing_law7_local_fixture");
    const disabled = { ...base, operational_status: "disabled" as const };
    const result = resolveSourceCapability({
      provider_id: disabled.provider_id, source_family: "laws", registry: [disabled],
    });
    expect(result.status).toBe("disabled");
    expect(result.executable).toBe(false);
  });

  test("rejects duplicate provider/transport/version registrations", () => {
    const one = SOURCE_CAPABILITY_REGISTRY[0] as SourceCapabilityRegistration;
    expect(() => createSourceCapabilityRegistry([one, one])).toThrow("duplicate_source_capability");
  });

  test("does not expose mutable registry arrays to callers", () => {
    const first = resolveSourceCapability({ provider_id: "pravo", source_family: "laws" });
    const attemptedMutation = first.capability?.source_families as string[] | undefined;
    attemptedMutation?.push("manuals");
    expect(resolveSourceCapability({ provider_id: "pravo", source_family: "manuals" }).status)
      .toBe("unsupported_source_family");
  });
});
