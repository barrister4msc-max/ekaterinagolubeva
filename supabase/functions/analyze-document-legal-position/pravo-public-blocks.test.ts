import { describe, expect, test } from "bun:test";
import { fetchPravoPublicBlocks } from "./pravo-public-blocks.ts";

describe("Pravo PublicBlocks transport", () => {
  test("requests the documented endpoint and keeps the upstream payload opaque", async () => {
    let requestedUrl = "";
    const result = await fetchPravoPublicBlocks("0001201708190001", {
      fetchImpl: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ blocks: [{ id: "b1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(requestedUrl).toBe(
      "https://publication.pravo.gov.ru/api/PublicBlocks?eoNumber=0001201708190001",
    );
    expect(result).toEqual({ blocks: [{ id: "b1" }] });
  });

  test("rejects malformed eoNumber before any network request", async () => {
    let called = false;
    await expect(
      fetchPravoPublicBlocks("not-an-eo-number", {
        fetchImpl: async () => {
          called = true;
          return new Response("{}");
        },
      }),
    ).rejects.toThrow("Invalid Pravo eoNumber");
    expect(called).toBe(false);
  });
});
