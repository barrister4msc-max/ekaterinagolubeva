import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin_or_superadmin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const SOURCE_TYPES = [
  "law_full_text",
  "court_practice",
  "fns_letter",
  "minfin_letter",
  "ekaterina_practice",
  "template",
  "memo",
] as const;

export const CATEGORIES = [
  "tax",
  "real_estate",
  "contracts",
  "court",
  "corporate",
  "compliance",
] as const;

export const DOCUMENT_TYPES = [
  "legal_analysis",
  "legal_position",
  "contract_example",
  "contract_template",
  "lease_agreement",
  "addendum",
  "act",
  "claim",
  "response_to_claim",
  "termination_letter",
  "notice",
  "complaint",
  "objections",
  "court_document",
  "court_decision",
  "due_diligence",
  "checklist",
  "memo",
  "other",
] as const;

export const IMPORT_STATUSES = [
  "pending",
  "blocked",
  "needs_redaction",
  "ready_for_review",
  "approved",
  "imported",
  "failed",
] as const;

const LIST_COLUMNS =
  "id, original_file_name, archive_name, source_type, category, subcategory, document_type, import_status, contains_personal_data, contains_passport_data, contains_bank_data, requires_redaction, approved_by_lawyer, approved_at, approved_by, imported_chunk_id, import_error, created_at, updated_at";

export const lkqListQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        import_status: z.string().optional(),
        source_type: z.string().optional(),
        category: z.string().optional(),
        document_type: z.string().optional(),
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("legal_knowledge_import_queue")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 300);
    if (data.import_status) q = q.eq("import_status", data.import_status);
    if (data.source_type) q = q.eq("source_type", data.source_type);
    if (data.category) q = q.eq("category", data.category);
    if (data.document_type) q = q.eq("document_type", data.document_type);
    if (data.search) q = q.ilike("original_file_name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const lkqGetItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Запись не найдена");
    return { row };
  });

const STATUS_TRANSITIONS = {
  blocked: "blocked",
  needs_redaction: "needs_redaction",
  ready_for_review: "ready_for_review",
} as const;

export const lkqSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["blocked", "needs_redaction", "ready_for_review"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .update({ import_status: STATUS_TRANSITIONS[data.status], updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lkqApproveForKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .update({
        approved_by_lawyer: true,
        approved_at: now,
        approved_by: context.userId,
        import_status: "approved",
        updated_at: now,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lkqImportToKb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: getErr } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!row) throw new Error("Запись не найдена");

    if (!row.approved_by_lawyer) throw new Error("Не одобрено юристом");
    if (row.import_status !== "approved") throw new Error("Статус должен быть 'approved'");
    const redactedAccepted = Boolean(row.redacted_text && String(row.redacted_text).trim().length > 0);
    if (row.contains_personal_data && !redactedAccepted) {
      throw new Error(
        "Нельзя импортировать документ в базу знаний: требуется принятое обезличивание.",
      );
    }
    if (row.contains_passport_data && !redactedAccepted) throw new Error("Содержит паспортные данные — обезличьте перед импортом");
    if (row.contains_bank_data && !redactedAccepted) throw new Error("Содержит банковские данные — обезличьте перед импортом");
    const content = (row.redacted_text ?? row.extracted_text ?? "").trim();
    if (!content) throw new Error("Текст пуст — нечего импортировать");

    if (row.imported_chunk_id) {
      throw new Error("Уже импортировано (chunk_id: " + row.imported_chunk_id + ")");
    }

    const metadata = {
      source_origin: "ekaterina_archive",
      archive_name: row.archive_name,
      original_file_name: row.original_file_name,
      category: row.category,
      subcategory: row.subcategory,
      document_type: row.document_type,
      confidential: true,
      client_data_removed: true,
      approved_by_lawyer: true,
      verification_status: "verified_local_source",
    };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("legal_knowledge_chunks")
      .insert({
        category: row.category,
        title: row.original_file_name,
        content,
        source_type: row.source_type,
        is_active: true,
        metadata,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    let embeddingError: string | null = null;
    try {
      const { error: fnErr } = await supabaseAdmin.functions.invoke("embed-legal-knowledge", {
        body: { chunk_id: inserted.id },
      });
      if (fnErr) embeddingError = fnErr.message || String(fnErr);
    } catch (e: any) {
      embeddingError = e?.message ?? String(e);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .update({
        import_status: "imported",
        imported_chunk_id: inserted.id,
        import_error: embeddingError ? `Imported to KB, but embedding failed: ${embeddingError}` : null,
        updated_at: now,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, chunk_id: inserted.id, embedding_failed: !!embeddingError };
  });
