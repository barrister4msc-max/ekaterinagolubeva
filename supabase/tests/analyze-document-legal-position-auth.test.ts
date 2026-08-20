import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeAnalyzerRequest } from "../functions/analyze-document-legal-position/auth-boundary.ts";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(testsDirectory, "../functions/analyze-document-legal-position/index.ts");

function mockClient(options: {
  user?: { id: string } | null;
  authError?: unknown;
  isAdmin?: boolean | null;
  roleError?: unknown;
}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      auth: {
        getUser: async (_token: string) => {
          calls.push("getUser");
          return {
            data: { user: options.user ?? null },
            error: options.authError ?? null,
          };
        },
      },
      rpc: async (_fn: "is_admin_or_superadmin", _args: { _user_id: string }) => {
        calls.push("roleCheck");
        return {
          data: options.isAdmin ?? null,
          error: options.roleError ?? null,
        };
      },
    },
  };
}

describe("analyze-document-legal-position authorization boundary", () => {
  test("OPTIONS remains outside the POST authorization boundary", async () => {
    const source = await Bun.file(functionPath).text();
    const options = source.indexOf('req.method === "OPTIONS"');
    const auth = source.indexOf("authorizeAnalyzerRequest(req, sb)");
    expect(options).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(options);
  });

  test("POST without Authorization fails 401 before auth RPC", async () => {
    const { client, calls } = mockClient({});
    const result = await authorizeAnalyzerRequest(new Request("http://test", { method: "POST" }), client);
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(calls).toEqual([]);
  });

  test("invalid or expired bearer fails 401", async () => {
    const { client, calls } = mockClient({ authError: new Error("invalid") });
    const result = await authorizeAnalyzerRequest(
      new Request("http://test", { method: "POST", headers: { Authorization: "Bearer garbage" } }),
      client,
    );
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(calls).toEqual(["getUser"]);
  });

  test("valid non-admin fails 403", async () => {
    const { client, calls } = mockClient({ user: { id: "user-1" }, isAdmin: false });
    const result = await authorizeAnalyzerRequest(
      new Request("http://test", { method: "POST", headers: { Authorization: "Bearer valid" } }),
      client,
    );
    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(calls).toEqual(["getUser", "roleCheck"]);
  });

  test("role-check error fails closed", async () => {
    const { client, calls } = mockClient({ user: { id: "user-1" }, roleError: new Error("rpc failed") });
    const result = await authorizeAnalyzerRequest(
      new Request("http://test", { method: "POST", headers: { Authorization: "Bearer valid" } }),
      client,
    );
    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(calls).toEqual(["getUser", "roleCheck"]);
  });

  test("admin passes the authorization boundary", async () => {
    const { client, calls } = mockClient({ user: { id: "admin-1" }, isAdmin: true });
    const result = await authorizeAnalyzerRequest(
      new Request("http://test", { method: "POST", headers: { Authorization: "Bearer valid" } }),
      client,
    );
    expect(result).toEqual({ ok: true, userId: "admin-1" });
    expect(calls).toEqual(["getUser", "roleCheck"]);
  });

  test("authorization completes before body/session parsing and before run insert", async () => {
    const source = await Bun.file(functionPath).text();
    const auth = source.indexOf("authorizeAnalyzerRequest(req, sb)");
    const body = source.indexOf("await req.json()");
    const sessionId = source.indexOf("body?.session_id");
    const runTable = source.indexOf('.from("document_intake_ai_runs")');
    const insert = source.indexOf(".insert({", runTable);

    expect(auth).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(auth);
    expect(sessionId).toBeGreaterThan(body);
    expect(runTable).toBeGreaterThan(sessionId);
    expect(insert).toBeGreaterThan(runTable);
  });
});
