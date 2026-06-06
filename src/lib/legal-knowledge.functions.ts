import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin_or_superadmin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

const SourceKind = z.enum(["law", "law_chunk", "knowledge_chunk", "case", "letter", "other"]);

export const lkListCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().trim().max(200).optional(),
        kind: SourceKind.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("v_legal_sources_catalog")
      .select("*")
      .order("usage_count", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.kind) q = q.eq("source_kind", data.kind);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const lkListGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["new", "in_progress", "resolved", "dismissed"]).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("legal_source_gap_requests")
      .select("*")
      .order("priority", { ascending: false })
      .order("request_count", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const lkUpdateGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "in_progress", "resolved", "dismissed"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: { status?: "new" | "in_progress" | "resolved" | "dismissed"; priority?: "low" | "medium" | "high" } = {};
    if (data.status) patch.status = data.status;
    if (data.priority) patch.priority = data.priority;
    if (!patch.status && !patch.priority) return { ok: true };
    const { error } = await supabase.from("legal_source_gap_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lkListVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pending", "running", "verified", "outdated", "failed"]).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("legal_source_verification_logs")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const lkRequestVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_kind: SourceKind,
        source_id: z.string().uuid().nullable().optional(),
        source_ref: z.string().max(500).nullable().optional(),
        source_title: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("legal_source_verification_logs").insert({
      source_kind: data.source_kind,
      source_id: data.source_id ?? null,
      source_ref: data.source_ref ?? null,
      source_title: data.source_title ?? null,
      requested_by: userId,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lkDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [laws, lawChunks, knowledgeChunks, usage30, gapsTop, verifPending] = await Promise.all([
      supabase.from("legal_laws").select("id", { count: "exact", head: true }),
      supabase.from("legal_law_chunks").select("id", { count: "exact", head: true }),
      supabase.from("legal_knowledge_chunks").select("id", { count: "exact", head: true }),
      supabase
        .from("legal_source_usage_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase
        .from("legal_source_gap_requests")
        .select("id, guessed_title, guessed_article, missing_source_type, request_count, priority, status")
        .in("status", ["new", "in_progress"])
        .order("request_count", { ascending: false })
        .limit(20),
      supabase
        .from("legal_source_verification_logs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "running"]),
    ]);

    // Top used sources from catalog view (usage_count is denormalized there)
    const { data: topUsed } = await supabase
      .from("v_legal_sources_catalog")
      .select("source_kind, source_id, title, usage_count, last_verification_status")
      .order("usage_count", { ascending: false })
      .limit(20);

    return {
      counts: {
        laws: laws.count ?? 0,
        chunks: (lawChunks.count ?? 0) + (knowledgeChunks.count ?? 0),
        usage30d: usage30.count ?? 0,
        verificationPending: verifPending.count ?? 0,
      },
      topUsed: topUsed ?? [],
      topGaps: gapsTop.data ?? [],
    };
  });

export const lkClassifySources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        items: z
          .array(
            z.object({
              key: z.string(),
              text: z.string().max(2000),
            }),
          )
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const results: Record<string, { matched: boolean; title?: string; source_kind?: string; source_id?: string }> = {};
    for (const item of data.items) {
      const text = item.text.trim();
      if (!text) {
        results[item.key] = { matched: false };
        continue;
      }
      // try several short tokens (first 60 chars) for ilike
      const probe = text.slice(0, 80).replace(/[%_]/g, " ");
      const { data: rows } = await supabase
        .from("v_legal_sources_catalog")
        .select("source_kind, source_id, title")
        .ilike("title", `%${probe}%`)
        .limit(1);
      if (rows && rows.length > 0) {
        results[item.key] = {
          matched: true,
          title: rows[0].title ?? undefined,
          source_kind: rows[0].source_kind ?? undefined,
          source_id: rows[0].source_id ?? undefined,
        };
      } else {
        results[item.key] = { matched: false };
      }
    }
    return { results };
  });

export const lkCreateGapRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        query_text: z.string().min(1).max(2000),
        missing_source_type: z.string().max(100).optional().nullable(),
        guessed_title: z.string().max(500).optional().nullable(),
        guessed_article: z.string().max(200).optional().nullable(),
        guessed_document_number: z.string().max(200).optional().nullable(),
        context: z.string().max(4000).optional().nullable(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        source_lead_id: z.string().uuid().optional().nullable(),
        source_review_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("legal_source_gap_requests").insert({
      query_text: data.query_text,
      missing_source_type: data.missing_source_type ?? "unknown",
      guessed_title: data.guessed_title ?? null,
      guessed_article: data.guessed_article ?? null,
      guessed_document_number: data.guessed_document_number ?? null,
      context: data.context ?? null,
      priority: data.priority ?? "medium",
      status: "new",
      source_lead_id: data.source_lead_id ?? null,
      source_review_id: data.source_review_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
