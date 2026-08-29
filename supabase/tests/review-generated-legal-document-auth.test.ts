import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(
  testsDirectory,
  "../functions/review-generated-legal-document/index.ts",
);

describe("review-generated-legal-document authorization boundary", () => {
  test("rejects unsupported methods and authenticates before reading request identifiers", async () => {
    const source = await Bun.file(functionPath).text();
    const methodGuard = source.indexOf('req.method !== "POST"');
    const authorizationRead = source.indexOf('req.headers.get("Authorization")');
    const trustedServer = source.indexOf("accessToken === serviceKey");
    const getUser = source.indexOf("supabase.auth.getUser(accessToken)");
    const roleCheck = source.indexOf('"is_admin_or_superadmin"');
    const requestBody = source.indexOf("await req.json()");

    expect(methodGuard).toBeGreaterThan(-1);
    expect(authorizationRead).toBeGreaterThan(methodGuard);
    expect(trustedServer).toBeGreaterThan(authorizationRead);
    expect(getUser).toBeGreaterThan(trustedServer);
    expect(roleCheck).toBeGreaterThan(getUser);
    expect(requestBody).toBeGreaterThan(roleCheck);
    expect(source).toContain('error: "Unauthorized" }, 401');
    expect(source).toContain('error: "Forbidden" }, 403');
  });

  test("binds generated document and intake ownership before reviewer context or Gemini", async () => {
    const source = await Bun.file(functionPath).text();
    const docRead = source.indexOf('.from("generated_legal_documents")');
    const docOwner = source.indexOf("doc.created_by && doc.created_by !== actorUserId");
    const sessionRead = source.indexOf('.from("document_intake_sessions")');
    const sessionOwner = source.indexOf("sessionData.created_by && sessionData.created_by !== actorUserId");
    const matterRead = source.indexOf('.from("legal_matters")');
    const geminiCall = source.indexOf("generativelanguage.googleapis.com");

    expect(docRead).toBeGreaterThan(-1);
    expect(docOwner).toBeGreaterThan(docRead);
    expect(sessionRead).toBeGreaterThan(docOwner);
    expect(sessionOwner).toBeGreaterThan(sessionRead);
    expect(matterRead).toBeGreaterThan(sessionOwner);
    expect(geminiCall).toBeGreaterThan(matterRead);
    expect(source).toContain("Generated document matter does not match intake session");
  });

  test("rejects mismatched or unaccepted legal-analysis run before external model calls", async () => {
    const source = await Bun.file(functionPath).text();
    const persistedRun = source.indexOf("persistedLegalAnalysisRunId");
    const mismatch = source.indexOf("legal_analysis_run_id does not match generated document");
    const runRead = source.indexOf('.from("document_intake_ai_runs")', persistedRun);
    const sessionMatch = source.indexOf('.eq("session_id", intakeSessionId)', runRead);
    const typeMatch = source.indexOf('.eq("run_type", "legal_analysis")', runRead);
    const statusMatch = source.indexOf('.eq("status", "completed")', runRead);
    const geminiCall = source.indexOf("generativelanguage.googleapis.com");

    expect(persistedRun).toBeGreaterThan(-1);
    expect(mismatch).toBeGreaterThan(persistedRun);
    expect(runRead).toBeGreaterThan(mismatch);
    expect(sessionMatch).toBeGreaterThan(runRead);
    expect(typeMatch).toBeGreaterThan(sessionMatch);
    expect(statusMatch).toBeGreaterThan(typeMatch);
    expect(geminiCall).toBeGreaterThan(statusMatch);
    expect(source).toContain("Accepted legal analysis run not found");
  });

  test("preserves trusted server auto-review and logs identifiers only", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain('callerType: "trusted_server" | "user"');
    expect(source).toContain("accessToken === serviceKey");
    expect(source).toContain('console.info("[reviewer-auth]"');
    expect(source).toContain("actor_user_id: actorUserId");
    expect(source).toContain("generated_document_id: targetDocumentId");
    expect(source).toContain("legal_analysis_run_id: persistedLegalAnalysisRunId");
    expect(source).not.toContain('console.info("[reviewer-auth]", prompt');
  });
});
