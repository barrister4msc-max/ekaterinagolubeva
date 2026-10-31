import { expect, test } from "bun:test";
import { ocrSourceFingerprint } from "../functions/_shared/ocr-source-fingerprint.ts";

test("OCR fingerprint hashes actual bytes and distinguishes equal-length replacements",async()=>{
  const a=await ocrSourceFingerprint(new TextEncoder().encode("abc").buffer,"lead-documents","original.pdf");
  const b=await ocrSourceFingerprint(new TextEncoder().encode("abd").buffer,"lead-documents","original.pdf");
  expect(a).toEqual({version:1,sha256:"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",byte_length:3,bucket:"lead-documents",storage_path:"original.pdf"});
  expect(b.byte_length).toBe(a.byte_length);expect(b.sha256).not.toBe(a.sha256);
  expect(await ocrSourceFingerprint(new TextEncoder().encode("abc").buffer,"lead-documents","original.pdf")).toEqual(a);
});
