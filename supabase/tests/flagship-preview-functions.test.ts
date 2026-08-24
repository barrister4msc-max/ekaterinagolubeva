import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const configPath = join(testsDirectory, "../config.toml");

const expectedFunctions = new Map([
  ["extract-document-text", false],
  ["document-intake-ai-fill", false],
  ["analyze-document-legal-position", false],
  ["generate-legal-document-v2", false],
  ["review-generated-legal-document", false],
]);

describe("flagship Preview function configuration", () => {
  test("declares the complete intake, generation, and review flow", async () => {
    const config = (await Bun.file(configPath).text()).replace(/\r\n/g, "\n");

    for (const [name, verifyJwt] of expectedFunctions) {
      expect(config).toContain(`[functions.${name}]`);
      expect(config).toContain(`[functions.${name}]\nverify_jwt = ${String(verifyJwt)}`);
    }
  });

  test("does not place secrets in config.toml", async () => {
    const config = (await Bun.file(configPath).text()).replace(/\r\n/g, "\n");

    expect(config).not.toMatch(/GEMINI_API_KEY|LOVABLE_API_KEY|SERVICE_ROLE_KEY/);
  });
});
