import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const functionPath = join(
  testsDirectory,
  "../functions/generate-legal-document-v2/index.ts",
);

describe("generate-legal-document-v2 authorization boundary", () => {
  test("authenticates and authorizes the actor before reading request identifiers", async () => {
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

  test("binds the intake session before any Gemini call or generated-document write", async () => {
    const source = await Bun.file(functionPath).text();
    const sessionRead = source.indexOf('.from("document_intake_sessions")');
    const sessionOwner = source.indexOf("session.created_by && session.created_by !== user.id");
    const geminiCall = source.indexOf("generativelanguage.googleapis.com");
    const generatedWrite = source.indexOf('.from("generated_legal_documents")');

    expect(sessionRead).toBeGreaterThan(-1);
    expect(sessionOwner).toBeGreaterThan(sessionRead);
    expect(geminiCall).toBeGreaterThan(sessionOwner);
    expect(generatedWrite).toBeGreaterThan(geminiCall);
    expect(source).toContain("Template does not match intake session");
    expect(source).toContain("Jurisdiction does not match intake session");
    expect(source).toContain("Language does not match intake session");
  });

  test("accepts legal analysis only from a completed legal_analysis run for the same session", async () => {
    const source = await Bun.file(functionPath).text();
    const runRead = source.indexOf('.from("document_intake_ai_runs")');
    const sessionMatch = source.indexOf('.eq("session_id", effectiveSessionId)', runRead);
    const typeMatch = source.indexOf('.eq("run_type", "legal_analysis")', runRead);
    const statusMatch = source.indexOf('.eq("status", "completed")', runRead);
    const authoritativeResult = source.indexOf("validatedLegalAnalysis = run.ai_result", runRead);
    const generatorInput = source.indexOf("const legalAnalysisObject = validatedLegalAnalysis", runRead);
    const geminiCall = source.indexOf("generativelanguage.googleapis.com");

    expect(runRead).toBeGreaterThan(-1);
    expect(sessionMatch).toBeGreaterThan(runRead);
    expect(typeMatch).toBeGreaterThan(sessionMatch);
    expect(statusMatch).toBeGreaterThan(typeMatch);
    expect(authoritativeResult).toBeGreaterThan(statusMatch);
    expect(generatorInput).toBeGreaterThan(authoritativeResult);
    expect(geminiCall).toBeGreaterThan(generatorInput);
    expect(source).toContain("Accepted legal analysis run not found");
    expect(source).toContain("legal_analysis_run_id is required with legal_analysis");
  });

  test("records the authenticated actor without changing the generator model contract", async () => {
    const source = await Bun.file(functionPath).text();

    expect(source).toContain('console.info("[generator-auth]"');
    expect(source).toContain("actor_user_id: user.id");
    expect(source).toContain("created_by: user.id");
    expect(source).toContain("gemini-2.5-flash-lite:generateContent");
    expect(source).toContain("temperature: 0.2");
    expect(source).toContain('responseMimeType: "application/json"');
  });
});
