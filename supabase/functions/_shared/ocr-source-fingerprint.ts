export type OcrStorageGeneration = { object_id: string; version: string };

export async function ocrSourceFingerprint(
  buffer: ArrayBuffer,
  bucket: string,
  storagePath: string,
  generation?: OcrStorageGeneration,
) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return {
    version: 1,
    sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    byte_length: buffer.byteLength,
    bucket,
    storage_path: storagePath,
    ...(generation ? { generation } : {}),
  };
}
