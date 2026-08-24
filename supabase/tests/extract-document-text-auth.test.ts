import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/extract-document-text/index.ts");

describe("extract-document-text authorization boundary", () => {
  test("requires either the exact service-role token or an authenticated admin", async () => {
    const source = (await Bun.file(functionPath).text()).replace(/\r\n/g, "\n");

    expect(source).toContain("async function authorizeRequest");
    expect(source).toContain("accessToken === SERVICE_ROLE");
    expect(source).toContain("supabase.auth.getUser(accessToken)");
    expect(source).toContain('supabase.rpc(\n    "is_admin_or_superadmin"');
    expect(source).toContain('status: 401');
    expect(source).toContain('status: 403');
  });

  test("authorizes before either document or archive lookup", async () => {
    const source = (await Bun.file(functionPath).text()).replace(/\r\n/g, "\n");
    const authIndex = source.indexOf("await authorizeRequest(req, supabase)");
    const bodyIndex = source.indexOf("await req.json()");
    const archiveIndex = source.indexOf("if (body.archive_item_id)");

    expect(authIndex).toBeGreaterThan(0);
    expect(authIndex).toBeLessThan(bodyIndex);
    expect(authIndex).toBeLessThan(archiveIndex);
  });
});
