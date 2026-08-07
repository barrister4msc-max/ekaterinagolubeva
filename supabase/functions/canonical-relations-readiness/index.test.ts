import { expect, test } from "bun:test";

test("readiness endpoint is service-role-only and does not select canonical payloads", async () => {
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(source).toContain("authorization !== `Bearer ${serviceRoleKey}`");
  expect(source).toContain('req.method !== "GET"');
  expect(source).not.toContain('select("relations');
  expect(source).not.toContain("conclusion_id");
  expect(source).not.toContain("source_ref");
});
