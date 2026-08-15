import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/document-intake-ai-fill/index.ts");

describe("document-intake-ai-fill authorization boundary", () => {
  test("validates the bearer token and admin role before reading identifiers", async () => {
    const source = await Bun.file(functionPath).text();
    const getUser = source.indexOf("supabase.auth.getUser(accessToken)");
    const roleCheck = source.indexOf('"is_admin_or_superadmin"');
    const requestBody = source.indexOf("await req.json()");

    expect(getUser).toBeGreaterThan(-1);
    expect(roleCheck).toBeGreaterThan(getUser);
    expect(requestBody).toBeGreaterThan(roleCheck);
    expect(source).toContain('error: "Unauthorized" }, 401');
    expect(source).toContain('error: "Forbidden" }, 403');
  });

  test("does not authorize from user-editable metadata", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).not.toMatch(/user_metadata|raw_user_meta_data/);
  });
});
