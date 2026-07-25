import { describe, expect, test } from "bun:test";
import { CANONICAL_RELATIONS_ENABLED_ENV, readCanonicalRelationsFeatureFlags } from "../index.ts";

describe("canonical-relations feature flags", () => {
  test("are disabled by default", () => {
    expect(readCanonicalRelationsFeatureFlags(() => undefined)).toEqual({ enabled: false });
  });

  test("parse an explicit true value through the injected reader", () => {
    const reader = (name: string) =>
      name === CANONICAL_RELATIONS_ENABLED_ENV ? "  TrUe " : undefined;
    expect(readCanonicalRelationsFeatureFlags(reader)).toEqual({ enabled: true });
  });

  test("do not enable for other truthy-looking values", () => {
    expect(readCanonicalRelationsFeatureFlags(() => "1")).toEqual({ enabled: false });
  });
});
