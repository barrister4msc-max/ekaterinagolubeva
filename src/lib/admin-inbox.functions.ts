import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();
  if (error) throw new Error("Не удалось проверить роль");
  if (!data) throw new Error("Доступ только для администратора");
}

export const listConversationsByLeadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { conversations: rows ?? [] };
  });

export const listMessagesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

export const listInboxFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: convs, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const conversations = convs ?? [];
    const leadIds = Array.from(new Set(conversations.map((c) => c.lead_id).filter(Boolean))) as string[];
    const convIds = conversations.map((c) => c.id);

    const [leadsRes, msgsRes] = await Promise.all([
      leadIds.length
        ? supabaseAdmin.from("leads").select("id,name,phone").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
      convIds.length
        ? supabaseAdmin
            .from("conversation_messages")
            .select("conversation_id,message_text,direction,created_at")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (msgsRes.error) throw new Error(msgsRes.error.message);

    const leadsMap = new Map((leadsRes.data ?? []).map((l) => [l.id, l]));
    const lastMsgMap = new Map<string, { message_text: string | null; direction: string; created_at: string }>();
    for (const m of msgsRes.data ?? []) {
      if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
    }

    const enriched = conversations.map((c) => ({
      ...c,
      leads: leadsMap.get(c.lead_id) ?? null,
      last_message: lastMsgMap.get(c.id) ?? null,
    }));

    return { conversations: enriched };
  });
