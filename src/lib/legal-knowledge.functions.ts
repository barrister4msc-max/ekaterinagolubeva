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

// ============================================================
// Source upload & management (no schema changes — uses
// legal_knowledge_chunks + jsonb metadata + communication-attachments bucket)
// ============================================================

const SourceType = z.enum([
  "codex",
  "federal_law",
  "fns_letter",
  "minfin_letter",
  "court_practice",
  "vs_review",
  "explanation",
  "other",
]);

const ImportStatus = z.enum(["draft", "pending", "processing", "completed", "failed", "needs_review"]);

const TRUSTED_HIGH = [
  "pravo.gov.ru", "publication.pravo.gov.ru", "nalog.gov.ru", "minfin.gov.ru",
  "vsrf.ru", "sudrf.ru", "kad.arbitr.ru", "cbr.ru", "government.ru",
  "kremlin.ru", "rosreestr.gov.ru", "fas.gov.ru",
];
const TRUSTED_MEDIUM = ["consultant.ru", "garant.ru"];

function trustLevelOf(url: string | null | undefined): "high" | "medium" | "low" | "unknown" {
  if (!url) return "unknown";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (TRUSTED_HIGH.some((d) => host === d || host.endsWith("." + d))) return "high";
    if (TRUSTED_MEDIUM.some((d) => host === d || host.endsWith("." + d))) return "medium";
    return "low";
  } catch {
    return "unknown";
  }
}

function chunkText(input: string, target = 1800): string[] {
  const clean = input.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > target && buf) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

const SourceMetadataInput = z.object({
  title: z.string().min(1).max(500),
  source_type: SourceType,
  document_number: z.string().max(200).optional().nullable(),
  document_date: z.string().max(50).optional().nullable(),
  edition_date: z.string().max(50).optional().nullable(),
  source_url: z.string().url().max(1000).optional().nullable(),
  article: z.string().max(200).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// 1) Manual text source
export const lkCreateManualSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    SourceMetadataInput.extend({ text_content: z.string().min(1).max(500_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const groupId = crypto.randomUUID();
    const chunks = chunkText(data.text_content);
    if (chunks.length === 0) throw new Error("Пустой текст источника");

    const trust = trustLevelOf(data.source_url);
    const baseMeta = {
      source_group_id: groupId,
      source_type: data.source_type,
      title: data.title,
      article: data.article ?? null,
      document_number: data.document_number ?? null,
      document_date: data.document_date ?? null,
      edition_date: data.edition_date ?? null,
      source_url: data.source_url ?? null,
      official_status: "unverified",
      verification_status: "needs_review",
      import_status: "pending" as const,
      trust_level: trust,
      ingest_mode: "manual_text",
      notes: data.notes ?? null,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
    };

    const rows = chunks.map((content, idx) => ({
      title: data.title,
      content,
      category: data.category ?? "manual",
      source_type: "manual_source",
      is_active: true,
      metadata: { ...baseMeta, chunk_index: idx, is_source_head: idx === 0, chunks_total: chunks.length },
    }));

    const { error } = await supabaseAdmin.from("legal_knowledge_chunks").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, source_group_id: groupId, chunks: chunks.length };
  });

// 2) URL-only source (no parsing)
export const lkCreateUrlSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SourceMetadataInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (!data.source_url) throw new Error("URL обязателен");

    const groupId = crypto.randomUUID();
    const trust = trustLevelOf(data.source_url);
    const metadata = {
      source_group_id: groupId,
      source_type: data.source_type,
      title: data.title,
      article: data.article ?? null,
      document_number: data.document_number ?? null,
      document_date: data.document_date ?? null,
      edition_date: data.edition_date ?? null,
      source_url: data.source_url,
      official_status: trust === "high" ? "official" : "unverified",
      verification_status: "needs_review",
      import_status: "pending",
      trust_level: trust,
      ingest_mode: "url_only",
      notes: data.notes ?? null,
      chunk_index: 0,
      is_source_head: true,
      chunks_total: 0,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("legal_knowledge_chunks").insert({
      title: data.title,
      content: `[URL-источник, ожидает индексации]\n${data.source_url}`,
      category: data.category ?? "manual",
      source_type: "manual_source",
      is_active: true,
      metadata,
    });
    if (error) throw new Error(error.message);
    return { ok: true, source_group_id: groupId };
  });

// 3) Upload file (base64) + create source record
export const lkUploadFileSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    SourceMetadataInput.extend({
      file_name: z.string().min(1).max(255),
      file_mime: z.string().max(200),
      file_base64: z.string().min(1).max(10_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const groupId = crypto.randomUUID();
    const safeName = data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `legal-sources/${groupId}/${safeName}`;

    const bytes = Uint8Array.from(atob(data.file_base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabaseAdmin.storage
      .from("communication-attachments")
      .upload(path, bytes, { contentType: data.file_mime, upsert: false });
    if (upErr) throw new Error("Загрузка файла: " + upErr.message);

    const trust = trustLevelOf(data.source_url);
    const metadata = {
      source_group_id: groupId,
      source_type: data.source_type,
      title: data.title,
      article: data.article ?? null,
      document_number: data.document_number ?? null,
      document_date: data.document_date ?? null,
      edition_date: data.edition_date ?? null,
      source_url: data.source_url ?? null,
      official_status: "unverified",
      verification_status: "needs_review",
      import_status: "pending",
      trust_level: trust,
      ingest_mode: "file_upload",
      file_path: path,
      file_name: data.file_name,
      file_mime: data.file_mime,
      notes: data.notes ?? null,
      chunk_index: 0,
      is_source_head: true,
      chunks_total: 0,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("legal_knowledge_chunks").insert({
      title: data.title,
      content: `[Файл загружен, ожидает индексации]\n${data.file_name}`,
      category: data.category ?? "manual",
      source_type: "manual_source",
      is_active: true,
      metadata,
    });
    if (error) throw new Error(error.message);
    return { ok: true, source_group_id: groupId, file_path: path };
  });

// 4) List manual sources (one row per source_group_id, head chunks only)
export const lkListManualSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().trim().max(200).optional(),
        source_type: SourceType.optional(),
        verification_status: z.string().max(50).optional(),
        import_status: ImportStatus.optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let q = supabaseAdmin
      .from("legal_knowledge_chunks")
      .select("id, title, content, category, metadata, is_active, created_at")
      .eq("source_type", "manual_source")
      .eq("metadata->>is_source_head", "true")
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.source_type) q = q.eq("metadata->>source_type", data.source_type);
    if (data.verification_status) q = q.eq("metadata->>verification_status", data.verification_status);
    if (data.import_status) q = q.eq("metadata->>import_status", data.import_status);
    if (data.search) q = q.or(`title.ilike.%${data.search}%,content.ilike.%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// 5) Update source metadata (applies across all chunks sharing source_group_id)
export const lkUpdateSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        source_group_id: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Fetch all chunks
    const { data: chunks, error: fErr } = await supabaseAdmin
      .from("legal_knowledge_chunks")
      .select("id, metadata")
      .eq("source_type", "manual_source")
      .eq("metadata->>source_group_id", data.source_group_id);
    if (fErr) throw new Error(fErr.message);
    if (!chunks?.length) throw new Error("Источник не найден");
    for (const c of chunks) {
      const merged = { ...(c.metadata as Record<string, unknown>), ...data.patch };
      const { error } = await supabaseAdmin
        .from("legal_knowledge_chunks")
        .update({ metadata: merged })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// 6) Deactivate a source
export const lkDeactivateSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ source_group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("legal_knowledge_chunks")
      .update({ is_active: false })
      .eq("source_type", "manual_source")
      .eq("metadata->>source_group_id", data.source_group_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// 7) Queue indexation: marks import_status = processing + logs verification request
export const lkQueueIndexation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ source_group_id: z.string().uuid(), title: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: chunks, error: fErr } = await supabaseAdmin
      .from("legal_knowledge_chunks")
      .select("id, metadata")
      .eq("source_type", "manual_source")
      .eq("metadata->>source_group_id", data.source_group_id);
    if (fErr) throw new Error(fErr.message);
    for (const c of chunks ?? []) {
      const merged = { ...(c.metadata as Record<string, unknown>), import_status: "processing" };
      await supabaseAdmin.from("legal_knowledge_chunks").update({ metadata: merged }).eq("id", c.id);
    }

    await supabaseAdmin.from("legal_source_verification_logs").insert({
      source_kind: "knowledge_chunk",
      source_id: null,
      source_ref: data.source_group_id,
      source_title: data.title ?? "Индексация источника",
      requested_by: userId,
      status: "pending",
    });
    return { ok: true };
  });

// 8) External search request for a gap (no actual web search — UI/queue only)
export const lkRequestExternalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        gap_id: z.string().uuid(),
        title: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin.from("legal_source_verification_logs").insert({
      source_kind: "other",
      source_id: null,
      source_ref: data.gap_id,
      source_title: data.title ?? "Поиск внешних источников",
      requested_by: userId,
      status: "pending",
      result_summary: "Очередь поиска внешних источников (без автоматического интернет-поиска)",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
