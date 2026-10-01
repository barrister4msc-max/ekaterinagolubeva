import { handlePravoRelayRequest } from "./handler.ts";

const token = Deno.env.get("KATI_RELAY_TOKEN")?.trim();
if (!token) {
  console.error("KATI_RELAY_TOKEN is required");
  Deno.exit(1);
}

Deno.serve({ hostname: "127.0.0.1", port: 8787 }, async (request) => {
  return await handlePravoRelayRequest(request, { KATI_RELAY_TOKEN: token });
});
