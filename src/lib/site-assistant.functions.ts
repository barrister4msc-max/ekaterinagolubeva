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

const CHANNEL_NAME = "Website AI Assistant";
const CHANNEL_TYPE = "site";

export const submitSiteAssistantIntake = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const displayName = data.name?.trim() || "Сайт / AI Assistant";

    // 1) Find or create channel "Website AI Assistant"
    let channelId: string;
    {
      const { data: existing } = await supabaseAdmin
        .from("communication_channels")
        .select("id")
        .eq("channel_type", CHANNEL_TYPE)
        .eq("name", CHANNEL_NAME)
        .maybeSingle();
      if (existing) {
        channelId = existing.id;
      } else {
        const { data: created, error } = await supabaseAdmin
          .from("communication_channels")
          .insert({ channel_type: CHANNEL_TYPE, name: CHANNEL_NAME, is_active: true })
          .select("id")
          .single();
        if (error || !created) return { ok: false as const, error: error?.message ?? "channel insert failed" };
        channelId = created.id;
      }
    }

    // 2) Find existing conversation for this session via raw_payload on prior messages
    let conversationId: string;
    let clientId: string;
    let leadId: string;

    let foundConvo: { id: string; crm_client_id: string | null; crm_lead_id: string | null } | null = null;
    {
      const { data: msgs } = await supabaseAdmin
        .from("communication_messages")
        .select("conversation_id, raw_payload, communication_conversations!inner(id, crm_client_id, crm_lead_id, channel_id)")
        .eq("raw_payload->>session_id", data.sessionId)
        .eq("raw_payload->>source", "site_assistant")
        .order("created_at", { ascending: false })
        .limit(1);
      if (msgs && msgs.length > 0) {
        const row = msgs[0] as unknown as {
          communication_conversations: {
            id: string;
            crm_client_id: string | null;
            crm_lead_id: string | null;
            channel_id: string;
          };
        };
        const c = row.communication_conversations;
        if (c && c.channel_id === channelId) {
          foundConvo = { id: c.id, crm_client_id: c.crm_client_id, crm_lead_id: c.crm_lead_id };
        }
      }
    }


    if (foundConvo && foundConvo.crm_client_id && foundConvo.crm_lead_id) {
      conversationId = foundConvo.id;
      clientId = foundConvo.crm_client_id;
      leadId = foundConvo.crm_lead_id;
    } else {
      // Create crm_client
      const { data: client, error: clientErr } = await supabaseAdmin
        .from("crm_clients")
        .insert({
          full_name: displayName,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          source: "site_assistant",
        })
        .select("id")
        .single();
      if (clientErr || !client) return { ok: false as const, error: clientErr?.message ?? "client insert failed" };
      clientId = client.id;

      // Create crm_lead
      const { data: lead, error: leadErr } = await supabaseAdmin
        .from("crm_leads")
        .insert({
          client_id: clientId,
          source: "site_assistant",
          status: "new",
          pipeline_stage: "intake",
          title: "Site assistant intake",
          description: data.text,
        })
        .select("id")
        .single();
      if (leadErr || !lead) return { ok: false as const, error: leadErr?.message ?? "lead insert failed" };
      leadId = lead.id;

      // Create conversation
      const { data: convo, error: convoErr } = await supabaseAdmin
        .from("communication_conversations")
        .insert({
          channel_id: channelId,
          crm_client_id: clientId,
          crm_lead_id: leadId,
          status: "active",
          last_message_at: nowIso,
        })
        .select("id")
        .single();
      if (convoErr || !convo) return { ok: false as const, error: convoErr?.message ?? "conversation insert failed" };
      conversationId = convo.id;
    }

    // 3) Insert communication_message
    const { data: messageInsert, error: msgErr } = await supabaseAdmin
      .from("communication_messages")
      .insert({
        conversation_id: conversationId,
        direction: "inbound",
        message_type: "text",
        text_content: data.text,
        raw_payload: {
          source: "site_assistant",
          session_id: data.sessionId,
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
      })
      .select("id")
      .single();

    if (msgErr || !messageInsert) {
      return { ok: false as const, error: msgErr?.message ?? "message insert failed" };
    }

    await supabaseAdmin
      .from("communication_conversations")
      .update({ last_message_at: nowIso, updated_at: nowIso })
      .eq("id", conversationId);

    // 4) Call existing Supabase Edge Function intake-orchestrator
    let aiAnalysis: string | null = null;
    let orchestratorError: string | null = null;
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceKey) {
        const resp = await fetch(`${supabaseUrl}/functions/v1/intake-orchestrator`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({ communication_message_id: messageInsert.id }),
        });
        const txt = await resp.text();
        if (resp.ok) {
          try {
            aiAnalysis = JSON.parse(txt);
          } catch {
            aiAnalysis = txt;
          }
        } else {
          orchestratorError = `intake-orchestrator ${resp.status}: ${txt.slice(0, 500)}`;
          console.error("[site-assistant]", orchestratorError);
        }
      } else {
        orchestratorError = "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY";
        console.error("[site-assistant]", orchestratorError);
      }
    } catch (err) {
      orchestratorError = err instanceof Error ? err.message : String(err);
      console.error("[site-assistant] intake-orchestrator call failed", orchestratorError);
    }

    return {
      ok: true as const,
      leadId,
      clientId,
      conversationId,
      messageId: messageInsert.id,
      aiAnalysis,
      orchestratorError,
    };
  });
