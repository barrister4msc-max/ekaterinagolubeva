import { handlePravoRelayRequest, type RelayEnv } from "./handler.ts";

export interface Env extends RelayEnv {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await handlePravoRelayRequest(request, env);
  },
};
