import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type TgUser = { id?: number; username?: string; first_name?: string };
type TgChat = { id?: number };
type TgMessage = { message_id?: number; text?: string; chat?: TgChat; from?: TgUser };
type TgUpdate = {
  update_id?: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

export const Route = createFileRoute("/api/webhooks/telegram")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!expected) {
          return new Response("Webhook secret not configured", { status: 500 });
        }
        const provided = request.headers.get("x-telegram-bot-api-secret-token");
        if (provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: TgUpdate;
        try {
          payload = (await request.json()) as TgUpdate;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const updateId = payload.update_id;
        if (typeof updateId !== "number") {
          return new Response("Missing update_id", { status: 400 });
        }

        // Idempotency: check if update_id already processed
        const { data: existing } = await supabaseAdmin
          .from("webhook_events")
          .select("id, processed")
          .eq("source", "telegram")
          .eq("external_event_id", String(updateId))
          .maybeSingle();

        if (existing) {
          return Response.json({ ok: true, duplicate: true });
        }

        // Insert webhook_event row
        const { data: eventRow, error: eventErr } = await supabaseAdmin
          .from("webhook_events")
          .insert({
            source: "telegram",
            external_event_id: String(updateId),
            payload: JSON.parse(JSON.stringify(payload)),
            processed: false,
          })
          .select("id")
          .single();

        if (eventErr || !eventRow) {
          return Response.json(
            { ok: false, error: eventErr?.message ?? "insert failed" },
            { status: 500 },
          );
        }

        const eventId = eventRow.id;
        const markError = async (msg: string) => {
          await supabaseAdmin
            .from("webhook_events")
            .update({ error: msg.slice(0, 2000) })
            .eq("id", eventId);
        };

        try {
          const message = payload.message ?? payload.edited_message;
          if (!message?.chat?.id) {
            await supabaseAdmin
              .from("webhook_events")
              .update({ processed: true })
              .eq("id", eventId);
            return Response.json({ ok: true, ignored: true });
          }

          const chatId = String(message.chat.id);
          const from = message.from ?? {};
          const messageText = message.text ?? "";
          const externalMessageId = message.message_id != null
            ? String(message.message_id)
            : null;
          const externalUserId = from.id != null ? String(from.id) : null;
          const displayName =
            from.first_name?.trim() ||
            from.username?.trim() ||
            "Telegram user";

          // Find conversation
          const { data: convo } = await supabaseAdmin
            .from("conversations")
            .select("id, lead_id")
            .eq("channel", "telegram")
            .eq("external_chat_id", chatId)
            .maybeSingle();

          let conversationId: string;
          let leadId: string;

          if (convo) {
            conversationId = convo.id;
            leadId = convo.lead_id;
          } else {
            // Create lead
            const { data: lead, error: leadErr } = await supabaseAdmin
              .from("leads")
              .insert({
                name: displayName,
                phone: "telegram",
                original_text: messageText || "(no text)",
                source: "telegram",
                status: "new",
                pipeline_stage: "new",
              })
              .select("id")
              .single();

            if (leadErr || !lead) {
              await markError(`lead insert failed: ${leadErr?.message}`);
              return Response.json({ ok: false }, { status: 500 });
            }
            leadId = lead.id;

            const { data: newConvo, error: convErr } = await supabaseAdmin
              .from("conversations")
              .insert({
                lead_id: leadId,
                channel: "telegram",
                external_chat_id: chatId,
                external_user_id: externalUserId,
                status: "open",
                last_message_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (convErr || !newConvo) {
              await markError(`conversation insert failed: ${convErr?.message}`);
              return Response.json({ ok: false }, { status: 500 });
            }
            conversationId = newConvo.id;
          }

          // Insert message
          const nowIso = new Date().toISOString();
          const { error: msgErr } = await supabaseAdmin
            .from("conversation_messages")
            .insert({
              conversation_id: conversationId,
              lead_id: leadId,
              channel: "telegram",
              direction: "inbound",
              message_text: messageText,
              external_message_id: externalMessageId,
              raw_payload: JSON.parse(JSON.stringify(payload)),
            });

          if (msgErr) {
            await markError(`message insert failed: ${msgErr.message}`);
            return Response.json({ ok: false }, { status: 500 });
          }

          // Update timestamps
          await supabaseAdmin
            .from("conversations")
            .update({ last_message_at: nowIso, updated_at: nowIso })
            .eq("id", conversationId);

          await supabaseAdmin
            .from("leads")
            .update({ last_contact_at: nowIso })
            .eq("id", leadId);

          await supabaseAdmin
            .from("webhook_events")
            .update({ processed: true })
            .eq("id", eventId);

          return Response.json({ ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await markError(msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
