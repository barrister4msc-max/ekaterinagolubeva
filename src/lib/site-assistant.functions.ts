import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  sessionId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  consent: z.literal(true),
  consentText: z.string().max(500),
  pageUrl: z.string().max(500).optional(),
});

export const submitSiteAssistantIntake = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = "site";
    const externalChatId = data.sessionId;
    const nowIso = new Date().toISOString();
    const displayName = data.name?.trim() || "Сайт / AI Assistant";

    // Find existing conversation for this session
    const { data: convo } = await supabaseAdmin
      .from("conversations")
      .select("id, lead_id")
      .eq("channel", channel)
      .eq("external_chat_id", externalChatId)
      .maybeSingle();

    let leadId: string;
    let conversationId: string;

    if (convo) {
      conversationId = convo.id;
      leadId = convo.lead_id;
    } else {
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("leads")
        .insert({
          name: displayName,
          phone: data.phone?.trim() || "site",
          contact: data.email?.trim() || null,
          original_text: data.text,
          source: "site_assistant",
          status: "new",
          pipeline_stage: "new",
          consent_given: true,
          consent_timestamp: nowIso,
          consent_source: "site_assistant",
          consent_version: "2026-05",
          privacy_policy_version: "2026-05",
          ai_processing_consent: true,
          legal_disclaimer_accepted: true,
          landing_url: data.pageUrl ?? null,
        })
        .select("id")
        .single();

      if (leadErr || !lead) {
        return { ok: false as const, error: leadErr?.message ?? "lead insert failed" };
      }
      leadId = lead.id;

      const { data: newConvo, error: convErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          lead_id: leadId,
          channel,
          external_chat_id: externalChatId,
          status: "open",
          last_message_at: nowIso,
        })
        .select("id")
        .single();

      if (convErr || !newConvo) {
        return { ok: false as const, error: convErr?.message ?? "conversation insert failed" };
      }
      conversationId = newConvo.id;
    }

    const { error: msgErr } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        lead_id: leadId,
        channel,
        direction: "inbound",
        message_text: data.text,
        raw_payload: {
          source: "site_assistant",
          consent_given: true,
          consent_text: data.consentText,
          consent_at: nowIso,
          consent_source: "site_assistant",
          privacy_url: "/privacy",
          consent_url: "/consent",
          page_url: data.pageUrl ?? null,
          contact: {
            name: data.name?.trim() || null,
            email: data.email?.trim() || null,
            phone: data.phone?.trim() || null,
          },
        },
      });

    if (msgErr) {
      return { ok: false as const, error: msgErr.message };
    }

    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: nowIso, updated_at: nowIso })
      .eq("id", conversationId);

    await supabaseAdmin
      .from("leads")
      .update({ last_contact_at: nowIso })
      .eq("id", leadId);

    return { ok: true as const, leadId, conversationId };
  });
