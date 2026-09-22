import { describe, expect, test } from "bun:test";
import {
  RESUMABLE_UPLOAD_CHUNK_BYTES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  buildUploadResumeKey,
  createImmutableStoragePath,
  directStorageUploadEndpoint,
  shouldUseResumableUpload,
} from "../../src/lib/resumable-storage-upload";

describe("Stage 13L-2A resumable Storage upload", () => {
  test("uses TUS only for files larger than 6 MB", () => {
    expect(shouldUseResumableUpload({ size: RESUMABLE_UPLOAD_THRESHOLD_BYTES })).toBe(false);
    expect(shouldUseResumableUpload({ size: RESUMABLE_UPLOAD_THRESHOLD_BYTES + 1 })).toBe(true);
    expect(RESUMABLE_UPLOAD_CHUNK_BYTES).toBe(6 * 1024 * 1024);
  });

  test("allocates an immutable object path before any retry", () => {
    const first = createImmutableStoragePath("session-1", { name: "scan.PDF" } as File, "object-a");
    const retry = createImmutableStoragePath("session-1", { name: "scan.PDF" } as File, "object-a");
    const nextUpload = createImmutableStoragePath("session-1", { name: "scan.PDF" } as File, "object-b");

    expect(first).toBe("builder/session-1/object-a.pdf");
    expect(retry).toBe(first);
    expect(nextUpload).not.toBe(first);
  });

  test("uses a stable opaque resume key without retaining the filename", async () => {
    const file = new File(["content"], "Иванов_договор.pdf", {
      type: "application/pdf",
      lastModified: 123,
    });
    const first = await buildUploadResumeKey("session-1", file);
    const second = await buildUploadResumeKey("session-1", file);

    expect(second).toBe(first);
    expect(first).not.toContain(file.name);
    expect(first).toStartWith("kati:resumable-upload:v1:");
  });

  test("uses the direct Supabase Storage hostname and no overwrite endpoint", () => {
    expect(directStorageUploadEndpoint("https://project-ref.supabase.co")).toBe(
      "https://project-ref.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  test("keeps the feature confined to the document staging boundary", async () => {
    const source = await Bun.file("src/components/document-builder/intake-form.tsx").text();
    expect(source).toContain("resolveUploadObjectIdentity(session.id, file)");
    expect(source).toContain("shouldUseResumableUpload(file)");
    expect(source).toContain("uploadResumablyToStorage");
    expect(source).toContain("clearUploadObjectIdentity(identity.resumeKey)");
  });
});
