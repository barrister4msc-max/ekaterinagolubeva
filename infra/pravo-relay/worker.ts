export interface Env {
  KATI_RELAY_TOKEN: string;
}

const PRAVO_ORIGIN = "https://publication.pravo.gov.ru";
const ALLOWED_PATHS = new Set(["/api/Documents", "/api/Document"]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

    const configuredToken = env.KATI_RELAY_TOKEN?.trim();
    if (!configuredToken) return json({ error: "relay_not_configured" }, 503);
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization !== `Bearer ${configuredToken}`) return json({ error: "unauthorized" }, 401);

    const incoming = new URL(request.url);
    if (!ALLOWED_PATHS.has(incoming.pathname)) return json({ error: "path_not_allowed" }, 404);

    const upstream = new URL(incoming.pathname + incoming.search, PRAVO_ORIGIN);
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "KATI-LAWYER-OfficialSourceRelay/1.0",
      },
      redirect: "error",
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-kati-relay-upstream": "publication.pravo.gov.ru",
      },
    });
  },
};
