import { describe, expect, test } from "bun:test";
import {
  defaultCanonicalRelationsFeatureFlags,
  readCanonicalRelationsFeatureFlags,
} from "../feature-flags.ts";

describe("canonical-relations feature flags", () => {
  test("defaults every flag to disabled", () => {
    expect(defaultCanonicalRelationsFeatureFlags()).toEqual({
      shadow: false,
      analytics: false,
      generator: false,
      reviewer: false,
    });
    expect(readCanonicalRelationsFeatureFlags()).toEqual(defaultCanonicalRelationsFeatureFlags());
  });

  test("enables only variables explicitly set to true", () => {
    const environment: Record<string, string> = {
      CANONICAL_RELATIONS_SHADOW: " TRUE ",
      CANONICAL_RELATIONS_ANALYTICS: "1",
      CANONICAL_RELATIONS_GENERATOR: "false",
      CANONICAL_RELATIONS_REVIEWER: "true",
    };

    expect(readCanonicalRelationsFeatureFlags((name) => environment[name])).toEqual({
      shadow: true,
      analytics: false,
      generator: false,
      reviewer: true,
    });
  });
});
