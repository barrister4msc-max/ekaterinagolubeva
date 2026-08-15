import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * SHA-256 fingerprint of the permanent private access token.
 * The token itself is never stored in code, logs, responses or the client bundle.
 */
export const PERMANENT_PRIVATE_ACCESS_SHA256 =
  "9089f2954257b41eb13d9dae3f0d3ecd241c961268ca4530cbc69b59dd2f9298";

function safeEqualBuffers(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns true if the supplied secret matches the permanent fingerprint or the env secret. */
export function isAuthorizedPrivateAccessSecret(
  secret: string,
  envSecret?: string | null,
): boolean {
  const digest = createHash("sha256").update(secret, "utf8").digest();
  const expected = Buffer.from(PERMANENT_PRIVATE_ACCESS_SHA256, "hex");
  if (safeEqualBuffers(digest, expected)) return true;

  if (envSecret) {
    if (safeEqualBuffers(Buffer.from(secret), Buffer.from(envSecret))) return true;
  }
  return false;
}

export const redeemPrivateAccessFn = createServerFn({ method: "POST" })
  .inputValidator((data: { secret: string }) => {
    if (!data || typeof data.secret !== "string") throw new Error("invalid_input");
    return data;
  })
  .handler(async ({ data }) => {
    const email = process.env.PRIVATE_ACCESS_ADMIN_EMAIL;
    if (!email) throw new Error("private_access_not_configured");

    const envSecret = process.env.PRIVATE_ACCESS_SECRET;
    if (!isAuthorizedPrivateAccessSecret(data.secret, envSecret)) {
      throw new Error("forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error || !linkData?.properties?.hashed_token) {
      throw new Error(error?.message ?? "link_generation_failed");
    }
    return {
      email,
      token_hash: linkData.properties.hashed_token,
    };
  });
