import { createServerFn } from "@tanstack/react-start";
import { timingSafeEqual } from "node:crypto";

export const redeemPrivateAccessFn = createServerFn({ method: "POST" })
  .inputValidator((data: { secret: string }) => {
    if (!data || typeof data.secret !== "string") throw new Error("invalid_input");
    return data;
  })
  .handler(async ({ data }) => {
    const expected = process.env.PRIVATE_ACCESS_SECRET;
    const email = process.env.PRIVATE_ACCESS_ADMIN_EMAIL;
    if (!expected || !email) throw new Error("private_access_not_configured");

    const a = Buffer.from(data.secret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
