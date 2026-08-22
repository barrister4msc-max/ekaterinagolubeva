import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../../src/lib/source-provenance";

describe("source provenance hashing", () => {
  test("hashes UTF-8 text deterministically", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("hashes uploaded bytes without text conversion", async () => {
    await expect(sha256Hex(new Uint8Array([97, 98, 99]))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb41015ad",
    );
  });

  test("does not produce an empty hash for non-empty content", async () => {
    await expect(sha256Hex("официальный документ")).resolves.not.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
