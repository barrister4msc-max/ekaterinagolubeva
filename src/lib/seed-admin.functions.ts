import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const seedAdminFn = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; secret: string }) => input)
  .handler(async ({ data }) => {
    if (data.secret !== "lovable-seed-2026") {
      throw new Error("forbidden");
    }
    const email = data.email.toLowerCase();

    // Try to find existing user
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw listErr;
    let user = list.users.find((u) => u.email?.toLowerCase() === email);

    if (!user) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      user = created.user!;
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
    if (roleErr) throw roleErr;

    return { userId: user.id, email: user.email };
  });
