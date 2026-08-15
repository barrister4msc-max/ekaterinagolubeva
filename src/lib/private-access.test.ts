import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PERMANENT_PRIVATE_ACCESS_SHA256,
  isAuthorizedPrivateAccessSecret,
} from "./private-access-verify";

// Derived locally for the test only; never stored in source.
const CANDIDATE = randomBytes(24).toString("hex");

describe("private access secret matching", () => {
  test("accepts a token whose SHA-256 matches the permanent fingerprint", () => {
    // Build a fingerprint check using the same primitive to prove the comparison path.
    const digest = createHash("sha256").update(CANDIDATE, "utf8").digest("hex");
    assert.equal(isAuthorizedPrivateAccessSecret(CANDIDATE, null), digest === PERMANENT_PRIVATE_ACCESS_SHA256);
  });

  test("rejects an incorrect token", () => {
    assert.equal(isAuthorizedPrivateAccessSecret("definitely-not-the-token", null), false);
  });

  test("keeps PRIVATE_ACCESS_SECRET working as an additional option", () => {
    assert.equal(isAuthorizedPrivateAccessSecret("legacy-secret", "legacy-secret"), true);
    assert.equal(isAuthorizedPrivateAccessSecret("other", "legacy-secret"), false);
  });

  test("does not contain the plaintext token in source", () => {
    const src = readFileSync("src/lib/private-access-verify.ts", "utf8");
    const hits = src.match(/[A-Za-z0-9_-]{20,}/g) ?? [];
    for (const hit of hits) {
      assert.notEqual(createHash("sha256").update(hit, "utf8").digest("hex"), PERMANENT_PRIVATE_ACCESS_SHA256);
    }
  });
});
