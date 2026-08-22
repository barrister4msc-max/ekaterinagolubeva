import { describe, expect, test } from "bun:test";
import { handlePravoRelayRequest } from "./handler.ts";

const env = { KATI_RELAY_TOKEN: "secret-token" };

describe("Pravo relay policy", () => {
  test("rejects non-GET methods", async () => {
    const response = await handlePravoRelayRequest(
      new Request("https://relay.example/api/Documents", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(405);
  });

  test("fails closed when token is not configured", async () => {
    const response = await handlePravoRelayRequest(
      new Request("https://relay.example/api/Documents"),
      { KATI_RELAY_TOKEN: "" },
    );
    expect(response.status).toBe(503);
  });

  test("requires exact bearer token", async () => {
    const response = await handlePravoRelayRequest(
      new Request("https://relay.example/api/Documents"),
      env,
    );
    expect(response.status).toBe(401);
  });

  test("blocks arbitrary paths before any upstream fetch", async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response("unexpected");
    }) as typeof fetch;

    const response = await handlePravoRelayRequest(
      new Request("https://relay.example/proxy?url=https://example.com", {
        headers: { authorization: "Bearer secret-token" },
      }),
      env,
      fakeFetch,
    );

    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });

  test("forwards only an allowlisted Pravo path to the fixed official origin", async () => {
    let requestedUrl = "";
    const fakeFetch = (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const response = await handlePravoRelayRequest(
      new Request("https://relay.example/api/Documents?Number=163-%D0%A4%D0%97", {
        headers: { authorization: "Bearer secret-token" },
      }),
      env,
      fakeFetch,
    );

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe("https://publication.pravo.gov.ru/api/Documents?Number=163-%D0%A4%D0%97");
    expect(response.headers.get("x-kati-relay-upstream")).toBe("publication.pravo.gov.ru");
  });
});
