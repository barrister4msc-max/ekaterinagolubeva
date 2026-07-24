// Alternative Vite config for Node runtime deployments (Timeweb App Platform).
// The default vite.config.ts targets Cloudflare Workers via @cloudflare/vite-plugin
// and uses src/server.ts as the Worker entry. This config keeps that setup
// untouched and instead builds a standalone Node server via Nitro's node-server
// preset, using TanStack Start's built-in server entry (compatible with Node).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    preset: "node-server",
  },
});
