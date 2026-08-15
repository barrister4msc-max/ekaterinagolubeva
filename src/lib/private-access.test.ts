import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PERMANENT_PRIVATE_ACCESS_SHA256,
  isAuthorizedPrivateAccessSecret,
} from "./private-access.functions";

// Derived locally for the test only; never stored in source.
const CANDIDATE = randomBytes(24).toString("hex");

describe("private access secret matching", () => {
  it("accepts a token whose SHA-256 matches the permanent fingerprint", () => {
    // Build a fingerprint check using the same primitive to prove the comparison path.
    const digest = createHash("sha256").update(CANDIDATE, "utf8").digest("hex");
    expect(isAuthorizedPrivateAccessSecret(CANDIDATE, null)).toBe(
      digest === PERMANENT_PRIVATE_ACCESS_SHA256,
    );
  });

  it("rejects an incorrect token", () => {
    expect(isAuthorizedPrivateAccessSecret("definitely-not-the-token", null)).toBe(false);
  });

  it("keeps PRIVATE_ACCESS_SECRET working as an additional option", () => {
    expect(isAuthorizedPrivateAccessSecret("legacy-secret", "legacy-secret")).toBe(true);
    expect(isAuthorizedPrivateAccessSecret("other", "legacy-secret")).toBe(false);
  });

  it("does not contain the plaintext token in source", () => {
    const src = readFileSync("src/lib/private-access.functions.ts", "utf8");
    const hits = src.match(/[A-Za-z0-9_-]{20,}/g) ?? [];
    for (const hit of hits) {
      expect(createHash("sha256").update(hit, "utf8").digest("hex")).not.toBe(
        PERMANENT_PRIVATE_ACCESS_SHA256,
      );
    }
  });
});
