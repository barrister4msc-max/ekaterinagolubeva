import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/seed-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("secret") !== "lovable-seed-2026") {
          return new Response("forbidden", { status: 403 });
        }
        const email = (url.searchParams.get("email") || "").toLowerCase();
        if (!email) return new Response("missing email", { status: 400 });

        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) return new Response(listErr.message, { status: 500 });
        let user = list.users.find((u) => u.email?.toLowerCase() === email);

        if (!user) {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
          });
          if (createErr) return new Response(createErr.message, { status: 500 });
          user = created.user!;
        }

        const { error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
        if (roleErr) return new Response(roleErr.message, { status: 500 });

        return new Response(JSON.stringify({ ok: true, userId: user.id, email: user.email }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
