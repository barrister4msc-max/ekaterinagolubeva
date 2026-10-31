import { expect, test } from "bun:test";
import {
  extractByOwnership,
  readServerOcr,
  usesServerOcr,
} from "../../src/lib/server-document-ocr";
test("server-owned documents only read status even after flag rollback; legacy files retain their route", async () => {
  const actions: string[] = [];
  let legacy = 0;
  const client = {
    functions: {
      invoke: async (_name: string, { body }: any) => {
        actions.push(body.action);
        return { data: { document_id: "doc", state: "queued", text_length: 0 }, error: null };
      },
    },
  };
  const options = {
    client,
    enabled: false,
    sessionId: "session",
    legacy: async () => {
      legacy++;
      return { extractionStatus: "completed", textLength: 4, attempts: 1 };
    },
  };
  const owned = { id: "doc", file_name: "scan.pdf", server_ocr_owned: true };
  expect((await extractByOwnership(owned, options)).serverQueued).toBe(true);
  expect(actions).toEqual(["status"]);
  expect(legacy).toBe(0);
  await extractByOwnership({ id: "doc", file_name: "other.docx" }, { ...options, enabled: true });
  expect(legacy).toBe(1);
  await extractByOwnership({ id: "doc", file_name: "scan.pdf" }, { ...options, enabled: true });
  expect(actions).toEqual(["status", "enqueue"]);
  expect(usesServerOcr({ id: "doc", mime_type: "application/pdf" }, true)).toBe(true);
});
test("server errors/timeouts never fall back to OCR and progress never grants completion", async () => {
  let legacy = 0;
  const options = {
    enabled: true,
    sessionId: "session",
    legacy: async () => {
      legacy++;
      return { extractionStatus: "completed", textLength: 4, attempts: 1 };
    },
  };
  for (const state of ["queued", "running", "paused", "needs_manual_review", "completed"]) {
    const client = {
      functions: {
        invoke: async () => ({
          data: {
            document_id: "doc",
            state,
            text_length: state === "completed" ? 8 : 0,
            progress: { percent: 100, complete: true },
          },
          error: null,
        }),
      },
    };
    const result = await extractByOwnership(
      { id: "doc", file_name: "scan.pdf" },
      { ...options, client },
    );
    expect(result.extractionStatus).toBe(
      state === "completed"
        ? "completed"
        : state === "needs_manual_review"
          ? "needs_manual_review"
          : "pending",
    );
  }
  const client = {
    functions: {
      invoke: async () => {
        throw Error("PRIVATE_RESPONSE");
      },
    },
  };
  const result = await extractByOwnership(
    { id: "doc", file_name: "scan.pdf" },
    { ...options, client },
  );
  expect(result.extractionStatus).toBe("failed");
  expect(result.error).not.toContain("PRIVATE_RESPONSE");
  expect(legacy).toBe(0);
  expect(
    (
      await extractByOwnership(
        { id: "doc", file_name: "scan.pdf" },
        { ...options, client, sessionId: null },
      )
    ).extractionStatus,
  ).toBe("failed");
  await expect(
    readServerOcr(
      {
        functions: {
          invoke: async () => ({ data: { document_id: "wrong", state: "completed" }, error: null }),
        },
      },
      "status",
      "s",
      "doc",
    ),
  ).rejects.toThrow();
});
