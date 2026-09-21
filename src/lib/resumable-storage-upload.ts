import * as tus from "tus-js-client";

/**
 * Supabase recommends TUS for files that may exceed 6 MB. Keep this boundary
 * in the staging layer only: it does not create a document row or start OCR.
 */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export const RESUMABLE_UPLOAD_RETRY_DELAYS = [0, 3_000, 5_000, 10_000, 20_000];

export type UploadObjectIdentity = {
  storagePath: string;
  resumeKey: string;
};

export type ResumableStorageUploadInput = {
  file: File;
  bucket: string;
  storagePath: string;
  resumeKey: string;
  supabaseUrl: string;
  accessToken: string;
  onProgress?: (uploaded: number, total: number) => void;
};

const RESUME_STORAGE_PREFIX = "kati:resumable-upload:v1:";

function extensionOf(fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  return String(extension || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
}

function storageForBrowser(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The local key contains no filename. It lets a user who re-selects the same
 * interrupted file continue against the already allocated immutable object.
 */
export async function buildUploadResumeKey(sessionId: string, file: File): Promise<string> {
  const fileIdentity = await digest([
    sessionId,
    file.name,
    file.size,
    file.lastModified,
    file.type,
  ].join("\u0000"));
  return `${RESUME_STORAGE_PREFIX}${fileIdentity}`;
}

export function createImmutableStoragePath(sessionId: string, file: File, objectId = crypto.randomUUID()): string {
  return `builder/${sessionId}/${objectId}.${extensionOf(file.name)}`;
}

export async function resolveUploadObjectIdentity(sessionId: string, file: File): Promise<UploadObjectIdentity> {
  const resumeKey = await buildUploadResumeKey(sessionId, file);
  const storage = storageForBrowser();
  const savedPath = storage?.getItem(resumeKey) ?? null;
  const sessionPrefix = `builder/${sessionId}/`;
  const storagePath = savedPath?.startsWith(sessionPrefix)
    ? savedPath
    : createImmutableStoragePath(sessionId, file);

  storage?.setItem(resumeKey, storagePath);
  return { storagePath, resumeKey };
}

export function clearUploadObjectIdentity(resumeKey: string): void {
  storageForBrowser()?.removeItem(resumeKey);
}

export function directStorageUploadEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/**
 * Upload exactly one pre-allocated object path. `x-upsert=false` makes a
 * collision fail instead of overwriting another object; TUS resumes only its
 * own in-progress upload URL for this immutable identity.
 */
export async function uploadResumablyToStorage(input: ResumableStorageUploadInput): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(input.file, {
      endpoint: directStorageUploadEndpoint(input.supabaseUrl),
      chunkSize: RESUMABLE_UPLOAD_CHUNK_BYTES,
      retryDelays: RESUMABLE_UPLOAD_RETRY_DELAYS,
      uploadDataDuringCreation: true,
      // Keep the TUS URL until the caller has also persisted the documents row.
      // A transient database failure can then retry the same immutable object.
      removeFingerprintOnSuccess: false,
      fingerprint: async () => input.resumeKey,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: input.bucket,
        objectName: input.storagePath,
        contentType: input.file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: input.onProgress,
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }, reject);
  });
}

export function shouldUseResumableUpload(file: Pick<File, "size">): boolean {
  return file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES;
}
