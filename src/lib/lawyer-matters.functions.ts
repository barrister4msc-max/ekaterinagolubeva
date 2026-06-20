import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin_or_superadmin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

/* ===== Matters ===== */

export const matterList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        search: z.string().trim().max(200).optional(),
        status: z.string().max(50).optional(),
        matter_type: z.string().max(50).optional(),
        priority: z.string().max(20).optional(),
        archive_status: z.string().max(20).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("legal_matters")
      .select("id,matter_number,title,matter_type,status,priority,archive_status,description,lawyer_notes,client_id,lead_id,risk_level,created_at,updated_at,opened_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.status) q = q.eq("status", data.status);
    if (data.matter_type) q = q.eq("matter_type", data.matter_type);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.archive_status) q = q.eq("archive_status", data.archive_status);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "");
      q = q.or(`title.ilike.%${s}%,matter_number.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const matterNextNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const year = new Date().getFullYear();
    const prefix = `MAT-${year}-`;
    const { data, error } = await supabase
      .from("legal_matters")
      .select("matter_number")
      .like("matter_number", `${prefix}%`)
      .order("matter_number", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    let next = 1;
    const last = data?.[0]?.matter_number as string | undefined;
    if (last) {
      const n = parseInt(last.slice(prefix.length), 10);
      if (!isNaN(n)) next = n + 1;
    }
    return { matter_number: `${prefix}${String(next).padStart(4, "0")}` };
  });

export const matterCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_number: z.string().trim().max(50).optional(),
        title: z.string().trim().min(1).max(300),
        matter_type: z.string().trim().min(1).max(50),
        status: z.string().trim().max(50).optional(),
        priority: z.string().trim().max(20).optional(),
        client_id: z.string().uuid().nullable().optional(),
        lead_id: z.string().uuid().nullable().optional(),
        description: z.string().max(10000).optional(),
        lawyer_notes: z.string().max(10000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const payload = {
      matter_number: data.matter_number || null,
      title: data.title,
      matter_type: data.matter_type,
      status: data.status || "new",
      priority: data.priority || "normal",
      client_id: data.client_id ?? null,
      lead_id: data.lead_id ?? null,
      description: data.description || null,
      lawyer_notes: data.lawyer_notes || null,
      source_type: "manual",
      archive_status: "active",
      created_by: userId,
    };
    const { data: row, error } = await supabase
      .from("legal_matters")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { matter: row };
  });

export const matterGet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("legal_matters")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Дело не найдено");
    return { matter: row };
  });

export const matterUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(300).optional(),
        status: z.string().max(50).optional(),
        priority: z.string().max(20).optional(),
        archive_status: z.string().max(20).optional(),
        description: z.string().max(10000).optional(),
        lawyer_notes: z.string().max(10000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { id, ...patch } = data;
    const { error } = await supabase.from("legal_matters").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ===== Documents ===== */

export const docList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_id: z.string().uuid().nullable().optional(),
        orphan: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("documents")
      .select("id,title,file_name,mime_type,storage_path,matter_id,lead_id,client_id,document_type,document_category,document_purpose,analysis_status,review_status,risk_level,ai_summary,is_archived,upload_source,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.matter_id) q = q.eq("matter_id", data.matter_id);
    else if (data.orphan) q = q.is("matter_id", null).is("lead_id", null).is("client_id", null).eq("upload_source", "lawyer_manual");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const docCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_id: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(1).max(300),
        file_name: z.string().max(300).optional(),
        mime_type: z.string().max(100).optional(),
        storage_path: z.string().max(500),
        document_type: z.string().max(100).optional(),
        document_category: z.string().max(100).optional(),
        document_purpose: z.string().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const payload = {
      matter_id: data.matter_id ?? null,
      title: data.title,
      file_name: data.file_name || data.title,
      mime_type: data.mime_type || null,
      storage_path: data.storage_path,
      document_type: data.document_type || null,
      document_category: data.document_category || null,
      document_purpose: data.document_purpose || null,
      upload_source: "lawyer_manual",
      uploaded_by: userId,
      analysis_status: "pending",
      review_status: "not_started",
      metadata: { source: "lawyer_workspace" },
    };
    const { data: row, error } = await supabase
      .from("documents")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { document: row };
  });

export const docAttachToMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), matter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("documents").update({ matter_id: data.matter_id }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const docDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ===== Strategy ===== */

export const strategyGet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("lawyer_matter_strategy")
      .select("*")
      .eq("matter_id", data.matter_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { strategy: row };
  });

export const strategyUpsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_id: z.string().uuid(),
        client_position: z.string().max(20000).optional().nullable(),
        opponent_position: z.string().max(20000).optional().nullable(),
        success_probability: z.string().max(50).optional().nullable(),
        ai_summary: z.string().max(20000).optional().nullable(),
        facts: z.array(z.string().max(2000)).optional(),
        strengths: z.array(z.string().max(2000)).optional(),
        weaknesses: z.array(z.string().max(2000)).optional(),
        risks: z.array(z.string().max(2000)).optional(),
        legal_basis: z.array(z.string().max(2000)).optional(),
        court_practice: z.array(z.string().max(2000)).optional(),
        recommended_documents: z.array(z.string().max(2000)).optional(),
        next_steps: z.array(z.string().max(2000)).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { matter_id, ...rest } = data;
    const { data: existing } = await supabase
      .from("lawyer_matter_strategy")
      .select("id")
      .eq("matter_id", matter_id)
      .maybeSingle();
    const patch: Record<string, unknown> = { matter_id, updated_by: userId };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    if (existing?.id) {
      const { error } = await (supabase.from("lawyer_matter_strategy") as any).update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      patch.created_by = userId;
      const { error } = await (supabase.from("lawyer_matter_strategy") as any).insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ===== Actions ===== */

export const actionList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("lawyer_document_actions")
      .select("*")
      .eq("matter_id", data.matter_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const actionCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_id: z.string().uuid(),
        document_id: z.string().uuid().nullable().optional(),
        action_type: z.string().trim().min(1).max(100),
        title: z.string().trim().min(1).max(300),
        description: z.string().max(10000).optional(),
        priority: z.string().max(20).optional(),
        status: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("lawyer_document_actions").insert({
      matter_id: data.matter_id,
      document_id: data.document_id ?? null,
      action_type: data.action_type,
      title: data.title,
      description: data.description || null,
      priority: data.priority || "medium",
      status: data.status || "suggested",
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const actionUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), status: z.string().max(20).optional(), priority: z.string().max(20).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { id, ...patch } = data;
    if (patch.status === "approved") (patch as any).approved_by = userId;
    const { error } = await supabase.from("lawyer_document_actions").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const actionDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("lawyer_document_actions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ===== Archive ===== */

export const archiveList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ matter_id: z.string().uuid().nullable().optional(), only_orphan: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("lawyer_archive_items")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.matter_id) q = q.eq("matter_id", data.matter_id);
    else if (data.only_orphan) q = q.is("matter_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const archiveCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matter_id: z.string().uuid().nullable().optional(),
        document_id: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(1).max(300),
        item_type: z.string().trim().min(1).max(50),
        category: z.string().max(100).optional(),
        description: z.string().max(10000).optional(),
        content: z.string().max(50000).optional(),
        source_url: z.string().max(500).optional(),
        tags: z.array(z.string().max(50)).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("lawyer_archive_items").insert({
      matter_id: data.matter_id ?? null,
      document_id: data.document_id ?? null,
      title: data.title,
      item_type: data.item_type,
      category: data.category || null,
      description: data.description || null,
      content: data.content || null,
      source_url: data.source_url || null,
      tags: data.tags || [],
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveDelete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("lawyer_archive_items").update({ is_active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ===== Archive: practice / ZIP ===== */

export const archivePracticeList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        practice_area: z.string().max(50).optional(),
        document_family: z.string().max(80).optional(),
        document_role: z.string().max(50).optional(),
        category: z.string().max(80).optional(),
        item_type: z.string().max(50).optional(),
        archive_batch_id: z.string().max(80).optional(),
        only_in_generation: z.boolean().optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    let q = supabase
      .from("lawyer_archive_items")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 500);
    if (data.category) q = q.eq("category", data.category);
    if (data.item_type) q = q.eq("item_type", data.item_type);
    if (data.practice_area) q = q.eq("metadata->>practice_area", data.practice_area);
    if (data.document_family) q = q.eq("metadata->>document_family", data.document_family);
    if (data.document_role) q = q.eq("metadata->>document_role", data.document_role);
    if (data.archive_batch_id) q = q.eq("metadata->>archive_batch_id", data.archive_batch_id);
    if (data.only_in_generation) q = q.eq("metadata->>use_in_generation", "true");
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "");
      q = q.ilike("title", `%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const archiveBulkCreate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        archive_batch_id: z.string().trim().min(1).max(80),
        items: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(300),
              storage_path: z.string().trim().min(1).max(500),
              original_filename: z.string().trim().min(1).max(300),
              file_extension: z.string().trim().max(20),
              file_size: z.number().int().nonnegative(),
              mime_type: z.string().max(120).optional(),
              category: z.string().max(80).optional(),
              item_type: z.string().max(50).optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const rows = data.items.map((it) => ({
      title: it.title,
      item_type: it.item_type || "document",
      category: it.category || "contracts_archive",
      storage_path: it.storage_path,
      created_by: userId,
      metadata: {
        original_filename: it.original_filename,
        archive_batch_id: data.archive_batch_id,
        file_extension: it.file_extension,
        file_size: it.file_size,
        mime_type: it.mime_type || null,
        upload_source: "zip_archive",
        use_in_generation: false,
        use_in_rag: false,
        requires_lawyer_approval: true,
        classification_status: "pending",
      },
    }));
    const { data: inserted, error } = await supabase
      .from("lawyer_archive_items")
      .insert(rows)
      .select("*");
    if (error) throw new Error(error.message);
    return { rows: inserted ?? [] };
  });

export const archiveUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        item_type: z.string().max(50).optional(),
        category: z.string().max(80).optional(),
        title: z.string().max(300).optional(),
        matter_id: z.string().uuid().nullable().optional(),
        metadata_patch: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Элемент не найден");
    const patch: Record<string, unknown> = {};
    if (data.item_type !== undefined) patch.item_type = data.item_type;
    if (data.category !== undefined) patch.category = data.category;
    if (data.title !== undefined) patch.title = data.title;
    if (data.matter_id !== undefined) patch.matter_id = data.matter_id;
    if (data.metadata_patch) {
      patch.metadata = { ...((row.metadata as Record<string, unknown>) ?? {}), ...data.metadata_patch };
    }
    const { error } = await (supabase.from("lawyer_archive_items") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveApproveStyle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Элемент не найден");
    const md = {
      ...((row.metadata as Record<string, unknown>) ?? {}),
      use_in_generation: true,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      approval_type: "style_reference",
    };
    const { error } = await supabase.from("lawyer_archive_items").update({ metadata: md }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveMakeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Элемент не найден");
    const md = {
      ...((row.metadata as Record<string, unknown>) ?? {}),
      use_in_generation: true,
      template_approved: true,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("lawyer_archive_items")
      .update({ item_type: "template", metadata: md })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveAddToMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), matter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: item, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!item) throw new Error("Элемент не найден");
    const md = (item.metadata ?? {}) as Record<string, any>;
    const { data: doc, error: e2 } = await supabase
      .from("documents")
      .insert({
        matter_id: data.matter_id,
        title: item.title,
        file_name: md.original_filename || item.title,
        mime_type: md.mime_type || null,
        storage_path: item.storage_path,
        document_type: md.document_family || null,
        document_category: md.practice_area || item.category || null,
        upload_source: "lawyer_archive",
        uploaded_by: userId,
        analysis_status: "pending",
        review_status: "not_started",
        metadata: { archive_item_id: item.id, source: "lawyer_archive" },
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    await supabase
      .from("lawyer_archive_items")
      .update({ matter_id: data.matter_id, document_id: doc.id })
      .eq("id", data.id);
    return { document_id: doc.id };
  });

export const archiveBatchesList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("lawyer_archive_items")
      .select("metadata, created_at")
      .eq("is_active", true)
      .eq("metadata->>upload_source", "zip_archive")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const map = new Map<string, { id: string; count: number; created_at: string }>();
    for (const r of data ?? []) {
      const id = (r.metadata as any)?.archive_batch_id;
      if (!id) continue;
      const cur = map.get(id);
      if (cur) cur.count += 1;
      else map.set(id, { id, count: 1, created_at: r.created_at as string });
    }
    return { batches: Array.from(map.values()) };
  });

/* ===== Anonymization ===== */

export const archiveCreateAnonymized = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        original_archive_item_id: z.string().uuid(),
        mode: z.enum(["soft", "strict", "full"]),
        storage_path: z.string().trim().min(1).max(500),
        title: z.string().trim().min(1).max(300),
        anonymization_status: z.enum(["completed", "needs_review", "failed"]),
        entities_summary: z
          .array(
            z.object({
              kind: z.string().max(40),
              count: z.number().int().nonnegative(),
            }),
          )
          .max(200)
          .optional(),
        entities_total: z.number().int().nonnegative().optional(),
        preview: z.string().max(20000).optional(),
        original_length: z.number().int().nonnegative().optional(),
        anonymized_length: z.number().int().nonnegative().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: src, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("*")
      .eq("id", data.original_archive_item_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Исходный элемент архива не найден");
    const srcMd = (src.metadata ?? {}) as Record<string, any>;
    const metadata: Record<string, any> = {
      ...srcMd,
      original_filename: `${(srcMd.original_filename || src.title || "document").replace(/\.[^.]+$/, "")}.anonymized.txt`,
      file_extension: "txt",
      mime_type: "text/plain",
      upload_source: "anonymizer",
      original_archive_item_id: src.id,
      is_anonymized: true,
      anonymization_mode: data.mode,
      anonymization_status: data.anonymization_status,
      anonymization_entities: data.entities_summary ?? [],
      anonymization_entities_total: data.entities_total ?? 0,
      anonymization_preview: data.preview ?? null,
      anonymization_original_length: data.original_length ?? null,
      anonymization_length: data.anonymized_length ?? null,
      anonymized_by: userId,
      anonymized_at: new Date().toISOString(),
      anonymization_note: data.note ?? null,
      // Reset usage flags — must be re-approved on the anonymized copy.
      use_in_generation: false,
      use_in_rag: false,
      can_use_for_training: false,
      template_approved: false,
      approved_at: null,
      approved_by: null,
      requires_lawyer_approval: true,
      classification_status: srcMd.classification_status ?? "pending",
    };
    const { data: inserted, error } = await supabase
      .from("lawyer_archive_items")
      .insert({
        title: data.title,
        item_type: "document",
        category: "anonymized",
        storage_path: data.storage_path,
        matter_id: src.matter_id,
        created_by: userId,
        metadata,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { item: inserted };
  });

export const archiveApproveTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Элемент не найден");
    const md = {
      ...((row.metadata as Record<string, unknown>) ?? {}),
      can_use_for_training: true,
      use_in_generation: true,
      approval_type: "style_reference",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("lawyer_archive_items")
      .update({ metadata: md })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function resolvePracticeArea(category: string | null, practiceArea: string | null): string {
  const cat = (category || "").toLowerCase();
  const pa = (practiceArea || "").toLowerCase();

  const realEstate = ["real_estate", "real_estate_law", "property", "realty"];
  if (realEstate.includes(cat) || realEstate.includes(pa)) return "real_estate";

  if (cat === "tax" || pa === "tax") return "tax";
  if (cat === "corporate" || pa === "corporate") return "corporate";

  const contracts = ["contracts", "contract"];
  if (contracts.includes(cat) || contracts.includes(pa)) return "contracts";

  const known = ["litigation", "land", "inheritance", "bankruptcy", "enforcement", "claims"];
  if (known.includes(pa)) return pa;
  if (known.includes(cat)) return cat;

  return "other";
}

export const archivePracticeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("lawyer_archive_items")
      .select("item_type, category, metadata")
      .eq("is_active", true)
      .limit(5000);
    if (error) throw new Error(error.message);
    const stats: Record<string, { total: number; gold: number; templates: number; unclassified: number; pending_approval: number }> = {};
    const bump = (area: string) => {
      if (!stats[area]) stats[area] = { total: 0, gold: 0, templates: 0, unclassified: 0, pending_approval: 0 };
      return stats[area];
    };
    for (const r of data ?? []) {
      const md = (r.metadata ?? {}) as any;
      const area = resolvePracticeArea(r.category, md.practice_area);
      const s = bump(area);
      s.total += 1;
      if (md.document_role === "gold_reference") s.gold += 1;
      if (r.item_type === "template" || md.template_approved) s.templates += 1;
      if (!md.classification_status || md.classification_status === "pending") s.unclassified += 1;
      if (md.requires_lawyer_approval && !md.approved_at) s.pending_approval += 1;
    }
    return { stats };
  });

/* ===== Practice → KB import queue ===== */

export const archiveGetExtractedText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("lawyer_archive_items")
      .select("id, title, storage_path, content, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Элемент не найден");
    const md = (row.metadata ?? {}) as Record<string, any>;
    // Per spec: extracted_text = coalesce(content, metadata->>'extracted_text')
    const extracted_text: string =
      (typeof row.content === "string" && row.content) ||
      (typeof md.extracted_text === "string" && md.extracted_text) ||
      (typeof md.ocr_text === "string" && md.ocr_text) ||
      "";
    return {
      id: row.id,
      title: row.title,
      storage_path: row.storage_path,
      extracted_text,
      redacted_text: typeof md.redacted_text === "string" ? md.redacted_text : null,
      metadata: md,
    };
  });

export const archiveClassify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        practice_area: z.string().max(50).optional(),
        document_family: z.string().max(80).optional(),
        category: z.string().max(80).optional(),
        subcategory: z.string().max(80).optional(),
        document_type: z.string().max(80).optional(),
        document_role: z.string().max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("category, item_type, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Элемент не найден");
    const md = { ...((row.metadata as Record<string, any>) ?? {}) };
    // Per spec: write practice_area / document_family / subcategory / document_type / role into metadata.
    if (data.practice_area !== undefined) md.practice_area = data.practice_area;
    if (data.document_family !== undefined) md.document_family = data.document_family;
    if (data.subcategory !== undefined) md.subcategory = data.subcategory;
    if (data.document_type !== undefined) md.document_type = data.document_type;
    if (data.document_role !== undefined) {
      md.role = data.document_role;
      md.document_role = data.document_role; // backward compat for existing readers
    }
    md.classification_status = "classified";
    md.classified_by = userId;
    md.classified_at = new Date().toISOString();
    // Per spec: also update category column + item_type column from the selected document_type.
    const patch: Record<string, unknown> = { metadata: md };
    if (data.category !== undefined) patch.category = data.category;
    if (data.document_type !== undefined) patch.item_type = data.document_type;
    const { error } = await (supabase.from("lawyer_archive_items") as any).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveSendToKbQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        archive_item_id: z.string().uuid(),
        // Optional overrides — merged into archive metadata, then final values are derived per spec.
        source_type: z.enum(["ekaterina_practice", "template", "memo"]).optional(),
        category: z.string().trim().min(1).max(80).optional(),
        subcategory: z.string().max(80).optional(),
        document_type: z.string().max(80).optional(),
        contains_personal_data: z.boolean().optional(),
        contains_passport_data: z.boolean().optional(),
        contains_bank_data: z.boolean().optional(),
        contains_signature: z.boolean().optional(),
        requires_redaction: z.boolean().optional(),
        redacted_text: z.string().max(500_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: item, error: e1 } = await supabase
      .from("lawyer_archive_items")
      .select("id, title, storage_path, content, category, item_type, metadata")
      .eq("id", data.archive_item_id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!item) throw new Error("Элемент архива не найден");

    const mdIn = (item.metadata ?? {}) as Record<string, any>;
    if (mdIn.kb_queue_id) throw new Error("Этот документ уже отправлен в очередь импорта KB");

    // Merge user overrides into metadata so the archive row stays the source of truth.
    const md: Record<string, any> = { ...mdIn };
    if (data.subcategory !== undefined) md.subcategory = data.subcategory;
    if (data.document_type !== undefined) md.document_type = data.document_type;
    if (data.contains_personal_data !== undefined) md.contains_personal_data = data.contains_personal_data;
    if (data.contains_passport_data !== undefined) md.contains_passport_data = data.contains_passport_data;
    if (data.contains_bank_data !== undefined) md.contains_bank_data = data.contains_bank_data;
    if (data.contains_signature !== undefined) md.contains_signature = data.contains_signature;
    if (data.requires_redaction !== undefined) md.requires_redaction = data.requires_redaction;
    if (data.redacted_text !== undefined) md.redacted_text = data.redacted_text;

    // Spec-driven derived values (read columns + metadata; never assume nonexistent columns).
    const archive_name: string | null =
      (typeof md.archive_name === "string" && md.archive_name) ||
      (typeof md.archive_batch_id === "string" ? md.archive_batch_id : null);
    const original_file_name: string =
      (typeof md.original_file_name === "string" && md.original_file_name) ||
      (typeof md.original_filename === "string" && md.original_filename) ||
      item.title;
    const category: string = data.category ?? item.category ?? "";
    const subcategory: string | null = (typeof md.subcategory === "string" && md.subcategory) || null;
    const document_type: string =
      (typeof md.document_type === "string" && md.document_type) || item.item_type || "other";
    const role: string | null =
      typeof md.role === "string"
        ? md.role
        : typeof md.document_role === "string"
          ? md.document_role
          : null;
    const source_type =
      data.source_type ??
      (role === "template" ? "template" : role === "memo" ? "memo" : "ekaterina_practice");

    const extracted_text: string =
      (typeof item.content === "string" && item.content) ||
      (typeof md.extracted_text === "string" && md.extracted_text) ||
      "";
    const redacted_text: string | null = typeof md.redacted_text === "string" ? md.redacted_text : null;

    const contains_personal_data = !!md.contains_personal_data;
    const contains_passport_data = !!md.contains_passport_data;
    const contains_bank_data = !!md.contains_bank_data;
    const requires_redaction = md.requires_redaction === undefined ? true : !!md.requires_redaction;

    if (!category) throw new Error("Не выбрана категория");
    if (contains_passport_data) throw new Error("Документ содержит паспортные данные — обезличьте перед отправкой в KB");
    if (contains_bank_data) throw new Error("Документ содержит банковские данные — обезличьте перед отправкой в KB");
    if (!extracted_text.trim()) throw new Error("Нет извлечённого текста — нечего отправлять в KB");

    const queueMetadata: Record<string, any> = {
      source_origin: "lawyer_archive",
      archive_item_id: item.id,
      original_file_name,
      category,
      subcategory,
      document_type,
      confidential: true,
      client_data_removed: false,
      approved_by_lawyer: false,
      verification_status: "lawyer_review_required",
    };

    const insertRow: Record<string, any> = {
      archive_name,
      original_file_name,
      storage_path: item.storage_path,
      source_type,
      category,
      subcategory,
      document_type,
      extracted_text: extracted_text || null,
      redacted_text,
      contains_personal_data,
      contains_passport_data,
      contains_bank_data,
      requires_redaction,
      import_status: "ready_for_review",
      approved_by_lawyer: false,
      metadata: queueMetadata,
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: queued, error: e2 } = await supabaseAdmin
      .from("legal_knowledge_import_queue")
      .insert(insertRow)
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);

    const newMd = {
      ...md,
      kb_queue_id: queued.id,
      sent_to_kb_at: new Date().toISOString(),
      kb_queue_sent_by: userId,
    };
    await supabase
      .from("lawyer_archive_items")
      .update({ metadata: newMd })
      .eq("id", item.id);

    return { ok: true, queue_id: queued.id };
  });

/* ===== AI content-based classification ===== */

const CLASSIFY_SYSTEM_PROMPT = `Ты классификатор юридических документов из рабочего архива практики юриста.
Верни СТРОГО валидный JSON, без markdown и без пояснений вне JSON.

Правила:
- Фото дела / сканы материалов дела / снимки страниц из суда → practice_area="court", document_type="case_materials_photo", document_role="evidence_raw", use_in_rag=false.
- Р11001, Р13014, Р34002, выписки ЕГРЮЛ, листы записи ФНС, свидетельства о регистрации → practice_area="corporate", document_type="registration_document", document_role="source_document", use_in_rag=false.
- Правовые позиции, аналитические записки, возражения, жалобы, правовые заключения юриста → document_role="gold_practice", use_in_rag=true.
- Шаблоны/типовые формы договоров, актов, претензий, уведомлений → document_role="template", use_in_rag=true.
- Паспорта, доверенности, банковские выписки, платёжки, СНИЛС, ИНН физлица → document_role="private_do_not_index", use_in_rag=false, contains_personal_data=true, requires_redaction=true.
- Письма ФНС / Минфина / разъяснения ведомств → document_role="source_document", добавь "must_not_treat_as_law": true.
- Тексты норм законов/кодексов/постановлений → document_role="source_document", document_type="law_reference".

Схема ответа:
{
  "practice_area": "tax|real_estate|corporate|court|contracts|land|compliance|other",
  "category": "строка",
  "subcategory": "строка",
  "document_type": "строка",
  "document_role": "gold_practice|template|source_document|evidence_raw|technical|private_do_not_index",
  "use_in_rag": true,
  "use_in_generation": true,
  "requires_ocr": false,
  "requires_redaction": false,
  "requires_lawyer_review": true,
  "contains_personal_data": false,
  "contains_passport_data": false,
  "contains_bank_data": false,
  "confidence": 0.0,
  "reason": "коротко почему"
}`;

async function classifyOneArchiveItem(
  supabase: any,
  userId: string,
  row: any,
  apiKey: string,
): Promise<void> {
  const md = (row.metadata ?? {}) as Record<string, any>;
  let text: string =
    (typeof row.content === "string" && row.content) ||
    (typeof md.extracted_text === "string" && md.extracted_text) ||
    (typeof md.ocr_text === "string" && md.ocr_text) ||
    "";

  // Try extract-document-text edge function if we have a document_id but no text yet
  if (text.trim().length < 50 && row.document_id) {
    try {
      const url = `${process.env.SUPABASE_URL}/functions/v1/extract-document-text`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ document_id: row.document_id }),
      });
      const { data: doc } = await supabase
        .from("documents")
        .select("ocr_text")
        .eq("id", row.document_id)
        .maybeSingle();
      if (doc && typeof doc.ocr_text === "string" && doc.ocr_text.length >= 50) {
        text = doc.ocr_text;
      }
    } catch {
      // fall through to filename fallback
    }
  }

  const filename: string =
    (typeof md.original_filename === "string" && md.original_filename) ||
    (typeof md.original_file_name === "string" && md.original_file_name) ||
    row.title ||
    "";
  const ext: string =
    (typeof md.file_extension === "string" && md.file_extension) ||
    (filename.includes(".") ? filename.split(".").pop()! : "");
  const usedFallback = text.trim().length < 50;
  const userPrompt = usedFallback
    ? `Имя файла: ${filename}\nРасширение: ${ext}\n(Извлечённого текста нет — классифицируй по имени файла.)`
    : `Имя файла: ${filename}\nРасширение: ${ext}\n\nФрагмент текста документа:\n${text.slice(0, 12000)}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 429) throw new Error("AI rate limit (429)");
    if (resp.status === 402) throw new Error("AI credits exhausted (402)");
    throw new Error(`AI HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }
  const j: any = await resp.json();
  const raw: string = j?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI вернул не-JSON");
    parsed = JSON.parse(m[0]);
  }

  const newMd: Record<string, any> = {
    ...md,
    ...parsed,
    document_role: parsed.document_role ?? md.document_role,
    practice_area: parsed.practice_area ?? md.practice_area,
    classification_status: "classified",
    classified_by: usedFallback ? "filename_fallback" : "ai_content",
    classified_at: new Date().toISOString(),
    classified_by_user: userId,
    classified_from: usedFallback ? "filename_fallback" : "content",
  };

  const patch: Record<string, any> = { metadata: newMd };
  if (parsed.practice_area) patch.category = parsed.practice_area;
  if (parsed.document_type) patch.item_type = parsed.document_type;

  const { error: upErr } = await (supabase.from("lawyer_archive_items") as any)
    .update(patch)
    .eq("id", row.id);
  if (upErr) throw new Error(upErr.message);
}

export const archiveClassifyBatchByContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        batch_id: z.string().trim().min(1).max(120).optional(),
        only_pending: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не сконфигурирован");

    let q = supabase
      .from("lawyer_archive_items")
      .select("id, title, content, storage_path, document_id, item_type, category, metadata")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    if (data.batch_id) q = q.eq("metadata->>archive_batch_id", data.batch_id);
    if (data.only_pending) {
      q = q.or(
        "metadata->>classification_status.is.null,metadata->>classification_status.eq.pending",
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let classified_count = 0;
    let failed_count = 0;
    const errors: { id: string; title: string; error: string }[] = [];

    for (const r of rows ?? []) {
      try {
        await classifyOneArchiveItem(supabase, userId, r, apiKey);
        classified_count += 1;
      } catch (e: any) {
        failed_count += 1;
        errors.push({ id: r.id, title: r.title, error: e?.message ?? String(e) });
      }
    }

    // Count remaining pending in the same scope
    let pq = supabase
      .from("lawyer_archive_items")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(
        "metadata->>classification_status.is.null,metadata->>classification_status.eq.pending",
      );
    if (data.batch_id) pq = pq.eq("metadata->>archive_batch_id", data.batch_id);
    const { count } = await pq;

    return {
      classified_count,
      failed_count,
      pending_count: count ?? 0,
      errors: errors.slice(0, 20),
    };
  });

/* ===== Text extraction / OCR pipeline ===== */

async function fetchExtractTargets(
  admin: any,
  args: { batch_id?: string; only_pending?: boolean; only_ocr_required?: boolean; limit: number },
) {
  let q = admin
    .from("lawyer_archive_items")
    .select("id, title, storage_path, content, metadata")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (args.batch_id) q = q.eq("metadata->>archive_batch_id", args.batch_id);
  if (args.only_pending) {
    q = q.or(
      "metadata->>text_extraction_status.is.null,metadata->>text_extraction_status.eq.pending",
    );
  }
  if (args.only_ocr_required) q = q.eq("metadata->>text_extraction_status", "ocr_required");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const archiveExtractTextBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        batch_id: z.string().trim().min(1).max(120).optional(),
        only_pending: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/archive-extract.server");

    const rows = await fetchExtractTargets(supabaseAdmin, {
      batch_id: data.batch_id,
      only_pending: data.only_pending,
      limit: data.limit ?? 50,
    });

    let completed = 0, ocr_required = 0, technical = 0, nested = 0, failed = 0;
    const errors: { id: string; title: string; error: string }[] = [];

    for (const r of rows) {
      const md = (r.metadata ?? {}) as Record<string, any>;
      const filename: string = md.original_filename || md.original_file_name || r.title || "";
      const ext: string = md.file_extension || helpers.extOf(filename);

      try {
        if (!r.storage_path) throw new Error("no_storage_path");
        const dl = await helpers.downloadArchiveFile(supabaseAdmin, r.storage_path);
        if (!dl) throw new Error("file_not_found_in_storage");

        const result = await helpers.extractByExtension(ext, dl.buf);
        const newMd: Record<string, any> = {
          ...md,
          text_extraction_status: result.status,
          text_extraction_method: result.method,
          text_extracted_at: new Date().toISOString(),
          extracted_text_length: result.text.length,
        };
        if (result.error) newMd.text_extraction_error = result.error;
        else delete newMd.text_extraction_error;
        if (result.requires_ocr) newMd.requires_ocr = true;
        if (result.requires_unpack) newMd.requires_unpack = true;
        if (result.document_role) newMd.document_role = result.document_role;
        if (result.use_in_rag !== undefined) newMd.use_in_rag = result.use_in_rag;
        if (result.use_in_generation !== undefined) newMd.use_in_generation = result.use_in_generation;

        const patch: Record<string, any> = { metadata: newMd };
        if (result.status === "completed" && result.text.length > 0) patch.content = result.text;

        const { error: upErr } = await (supabaseAdmin.from("lawyer_archive_items") as any).update(patch)
          .eq("id", r.id);
        if (upErr) throw new Error(upErr.message);

        if (result.status === "completed") completed += 1;
        else if (result.status === "ocr_required") ocr_required += 1;
        else if (result.status === "technical_file") technical += 1;
        else if (result.status === "nested_archive") nested += 1;
        else failed += 1;
      } catch (e: any) {
        failed += 1;
        errors.push({ id: r.id, title: r.title, error: e?.message ?? String(e) });
        const newMd: Record<string, any> = {
          ...md,
          text_extraction_status: "failed",
          text_extraction_error: e?.message ?? String(e),
          text_extracted_at: new Date().toISOString(),
        };
        await (supabaseAdmin.from("lawyer_archive_items") as any).update({ metadata: newMd })
          .eq("id", r.id);
      }
    }

    return {
      processed: rows.length,
      completed,
      ocr_required,
      technical,
      nested,
      failed,
      errors: errors.slice(0, 20),
    };
  });

export const archiveOcrBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        batch_id: z.string().trim().min(1).max(120).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/archive-extract.server");

    const rows = await fetchExtractTargets(supabaseAdmin, {
      batch_id: data.batch_id,
      only_ocr_required: true,
      limit: data.limit ?? 20,
    });

    let ocr_completed = 0, failed = 0;
    const errors: { id: string; title: string; error: string }[] = [];

    const runOne = async (r: any) => {
      const md = (r.metadata ?? {}) as Record<string, any>;
      try {
        if (!r.storage_path) throw new Error("no_storage_path");
        const url = `${process.env.SUPABASE_URL}/functions/v1/extract-document-text`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            archive_item_id: r.id,
            storage_path: r.storage_path,
            mime_type: md.mime_type,
            file_name: md.original_filename || md.original_file_name || r.title,
          }),
        });
        const j: any = await resp.json().catch(() => ({}));
        if (!resp.ok || j?.ok !== true) {
          throw new Error(j?.error || `edge_http_${resp.status}`);
        }
        ocr_completed += 1;
      } catch (e: any) {
        failed += 1;
        const errMsg = e?.message ?? String(e);
        errors.push({ id: r.id, title: r.title, error: errMsg });
        const newMd: Record<string, any> = {
          ...md,
          text_extraction_status: "ocr_failed",
          ocr_error: errMsg,
          text_extraction_error: errMsg,
          ocr_last_attempt_at: new Date().toISOString(),
        };
        await (supabaseAdmin.from("lawyer_archive_items") as any).update({ metadata: newMd })
          .eq("id", r.id);
      }
    };
    // Parallel — each Gemini OCR is ~3-5s; sequential 20× would exceed the server-fn wall time.
    await Promise.allSettled(rows.map(runOne));

    let remainingQ = (supabaseAdmin.from("lawyer_archive_items") as any)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("metadata->>text_extraction_status", "ocr_required");
    if (data.batch_id) remainingQ = remainingQ.eq("metadata->>archive_batch_id", data.batch_id);
    const { count: remaining_ocr_required } = await remainingQ;

    return {
      processed: rows.length,
      completed: ocr_completed,
      ocr_completed,
      ocr_failed: failed,
      failed,
      remaining_ocr_required: remaining_ocr_required ?? 0,
      errors: errors.slice(0, 20),
    };
  });

export const archiveProcessBatchFully = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        batch_id: z.string().trim().min(1).max(120).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const helpers = await import("@/lib/archive-extract.server");

    const limit = data.limit ?? 100;
    // STEP 1: extract text for everything
    const extractTargets = await fetchExtractTargets(supabaseAdmin, {
      batch_id: data.batch_id,
      limit,
    });
    let extract_completed = 0, extract_ocr_required = 0, extract_failed = 0;
    for (const r of extractTargets) {
      const md = (r.metadata ?? {}) as Record<string, any>;
      const filename: string = md.original_filename || md.original_file_name || r.title || "";
      const ext: string = md.file_extension || helpers.extOf(filename);
      try {
        if (!r.storage_path) throw new Error("no_storage_path");
        const dl = await helpers.downloadArchiveFile(supabaseAdmin, r.storage_path);
        if (!dl) throw new Error("file_not_found_in_storage");
        const result = await helpers.extractByExtension(ext, dl.buf);
        const newMd: Record<string, any> = {
          ...md,
          text_extraction_status: result.status,
          text_extraction_method: result.method,
          text_extracted_at: new Date().toISOString(),
          extracted_text_length: result.text.length,
        };
        if (result.error) newMd.text_extraction_error = result.error;
        else delete newMd.text_extraction_error;
        if (result.requires_ocr) newMd.requires_ocr = true;
        if (result.requires_unpack) newMd.requires_unpack = true;
        if (result.document_role) newMd.document_role = result.document_role;
        if (result.use_in_rag !== undefined) newMd.use_in_rag = result.use_in_rag;
        if (result.use_in_generation !== undefined) newMd.use_in_generation = result.use_in_generation;
        const patch: Record<string, any> = { metadata: newMd };
        if (result.status === "completed" && result.text.length > 0) patch.content = result.text;
        await (supabaseAdmin.from("lawyer_archive_items") as any).update(patch).eq("id", r.id);
        if (result.status === "completed") extract_completed += 1;
        else if (result.status === "ocr_required") extract_ocr_required += 1;
        else if (result.status === "failed") extract_failed += 1;
      } catch (e: any) {
        extract_failed += 1;
      }
    }

    // STEP 2: OCR pass
    const ocrTargets = await fetchExtractTargets(supabaseAdmin, {
      batch_id: data.batch_id,
      only_ocr_required: true,
      limit: Math.min(50, limit),
    });
    let ocr_completed = 0, ocr_failed = 0;
    for (const r of ocrTargets) {
      const md = (r.metadata ?? {}) as Record<string, any>;
      try {
        if (!r.storage_path) throw new Error("no_storage_path");
        const url = `${process.env.SUPABASE_URL}/functions/v1/extract-document-text`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            archive_item_id: r.id,
            storage_path: r.storage_path,
            mime_type: md.mime_type,
            file_name: md.original_filename || md.original_file_name || r.title,
          }),
        });
        const j: any = await resp.json().catch(() => ({}));
        if (!resp.ok || j?.ok !== true) throw new Error(j?.error || `edge_http_${resp.status}`);
        ocr_completed += 1;
      } catch {
        ocr_failed += 1;
      }
    }

    // STEP 3: AI classify all pending in scope
    const apiKey = process.env.LOVABLE_API_KEY;
    let classified = 0, classify_failed = 0;
    if (apiKey) {
      let cq = supabaseAdmin
        .from("lawyer_archive_items")
        .select("id, title, content, storage_path, document_id, item_type, category, metadata")
        .eq("is_active", true)
        .or("metadata->>classification_status.is.null,metadata->>classification_status.eq.pending")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (data.batch_id) cq = cq.eq("metadata->>archive_batch_id", data.batch_id);
      const { data: crows } = await cq;
      for (const r of crows ?? []) {
        try {
          await classifyOneArchiveItem(supabaseAdmin, userId, r, apiKey);
          classified += 1;
        } catch {
          classify_failed += 1;
        }
      }
    }

    return {
      extract: { completed: extract_completed, ocr_required: extract_ocr_required, failed: extract_failed },
      ocr: { completed: ocr_completed, failed: ocr_failed },
      classify: { classified, failed: classify_failed },
    };
  });

/* ===== AI Analysis (full practice analysis for RAG/generation readiness) ===== */

const AI_ANALYSIS_VERSION = "v1";

const AI_ANALYSIS_SYSTEM_PROMPT = `Ты — старший юрист-аналитик практики Екатерины Голубевой (недвижимость, налоги, суды, договоры, земля, корпоративное).
Задача: глубоко проанализировать документ из её рабочего архива и подготовить его для базы знаний (RAG), генерации документов и поиска практики.
Верни СТРОГО валидный JSON, без markdown, без пояснений вне JSON, без trailing запятых.

Жёсткие правила качества (quality_score 0–100):
- 90–100 = Gold: правовая позиция, аналитическая записка, грамотные возражения/жалобы, готовое заключение, эталонный шаблон.
- 75–89 = Silver: добротный рабочий документ (иск, претензия, отзыв), пригодный как образец.
- 50–74 = Bronze: пригоден как контекст, но не как эталон.
- 0–49 = Не использовать (мусор, обрывки OCR, дубли, нерелевантное).

Жёсткие правила доступа:
- Доверенности → document_role="private_do_not_index", use_in_rag=false, requires_redaction=true, contains_personal_data=true.
- Паспорта, СНИЛС, ИНН физлица → document_role="private_do_not_index", use_in_rag=false, requires_redaction=true, contains_personal_data=true, contains_passport_data=true.
- Банковские выписки, платёжки, реквизиты счетов → document_role="private_do_not_index", use_in_rag=false, requires_redaction=true, contains_bank_data=true.
- Файлы .p7s, .sig, технические подписи → document_role="technical", quality_score≤20, use_in_rag=false.
- ZIP, вложенные архивы → document_role="technical", quality_score=0, use_in_rag=false.
- OCR-мусор (нечитаемый, <100 осмысленных символов) → quality_score≤30, use_in_rag=false.

gold_candidate=true только если quality_score≥90 И use_in_rag=true И НЕТ персональных/паспортных/банковских данных.

Схема ответа:
{
  "document_role": "gold_practice|template|source_document|evidence_raw|technical|private_do_not_index",
  "practice_area": "real_estate|tax|litigation|contracts|land|corporate|inheritance|bankruptcy|enforcement|claims|other",
  "legal_topics": ["строка", "..."],
  "key_facts": ["строка", "..."],
  "key_risks": ["строка", "..."],
  "quality_score": 0,
  "quality_tier": "gold|silver|bronze|reject",
  "gold_candidate": false,
  "use_in_rag": false,
  "use_in_generation": false,
  "requires_redaction": false,
  "contains_personal_data": false,
  "contains_passport_data": false,
  "contains_bank_data": false,
  "short_summary": "1–3 предложения по сути документа",
  "rag_title": "короткий заголовок для базы знаний",
  "court": {
    "court_document_type": "иск|отзыв|возражения|апелляция|кассация|определение|решение|null",
    "dispute_subject": "строка|null",
    "procedural_stage": "первая|апелляция|кассация|надзор|исполнение|null",
    "winning_arguments": ["..."],
    "losing_arguments": ["..."],
    "outcome": "удовлетворено|частично|отказано|мировое|прекращено|null"
  },
  "contract": {
    "contract_type": "строка|null",
    "subject": "строка|null",
    "critical_risks": ["..."],
    "strong_clauses": ["..."],
    "template_ready": false
  },
  "real_estate": {
    "object_type": "квартира|дом|нежилое|земля|null",
    "deal_type": "купля-продажа|аренда|дарение|мена|ипотека|null",
    "main_risks": ["..."],
    "recommendations": ["..."]
  }
}

Если документ не относится к судам/договорам/недвижимости — соответствующий вложенный объект верни со всеми полями null или пустыми массивами.`;

function deriveQualityTier(score: number): "gold" | "silver" | "bronze" | "reject" {
  if (score >= 90) return "gold";
  if (score >= 75) return "silver";
  if (score >= 50) return "bronze";
  return "reject";
}

async function analyzeOneArchiveItem(
  supabase: any,
  userId: string,
  row: any,
  apiKey: string,
): Promise<void> {
  const md = (row.metadata ?? {}) as Record<string, any>;
  const text: string = typeof row.content === "string" ? row.content : "";
  if (text.trim().length < 50) {
    // Cannot analyze without content — mark as skipped, not failed.
    const newMd = {
      ...md,
      ai_analysis_status: "skipped_no_text",
      ai_analysis_at: new Date().toISOString(),
      ai_analysis_version: AI_ANALYSIS_VERSION,
      quality_score: 0,
      quality_tier: "reject",
      use_in_rag: false,
    };
    await (supabase.from("lawyer_archive_items") as any).update({ metadata: newMd }).eq("id", row.id);
    return;
  }

  const filename: string = md.original_filename || md.original_file_name || row.title || "";
  const ext: string = md.file_extension || (filename.includes(".") ? filename.split(".").pop() : "");
  const hintedPracticeArea = md.practice_area ? `\nТекущая отнесённая область практики: ${md.practice_area}` : "";
  const hintedDocType = md.document_type ? `\nТекущий тип документа: ${md.document_type}` : "";

  const userPrompt = `Имя файла: ${filename}
Расширение: ${ext}${hintedPracticeArea}${hintedDocType}

Текст документа (может быть обрезан):
${text.slice(0, 18000)}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: AI_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 429) throw new Error("AI rate limit (429)");
    if (resp.status === 402) throw new Error("AI credits exhausted (402)");
    throw new Error(`AI HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }
  const j: any = await resp.json();
  const raw: string = j?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI вернул не-JSON");
    parsed = JSON.parse(m[0]);
  }

  const qScore = Math.max(0, Math.min(100, Number(parsed.quality_score ?? 0)));
  const qTier = parsed.quality_tier && ["gold", "silver", "bronze", "reject"].includes(parsed.quality_tier)
    ? parsed.quality_tier
    : deriveQualityTier(qScore);

  // Safety overrides — never trust the model on PII flags downgrading themselves.
  const isPrivate = parsed.document_role === "private_do_not_index"
    || parsed.contains_passport_data === true
    || parsed.contains_bank_data === true;

  const newMd: Record<string, any> = {
    ...md,
    document_role: parsed.document_role ?? md.document_role,
    practice_area: parsed.practice_area ?? md.practice_area,
    legal_topics: Array.isArray(parsed.legal_topics) ? parsed.legal_topics.slice(0, 30) : [],
    key_facts: Array.isArray(parsed.key_facts) ? parsed.key_facts.slice(0, 30) : [],
    key_risks: Array.isArray(parsed.key_risks) ? parsed.key_risks.slice(0, 30) : [],
    quality_score: qScore,
    quality_tier: qTier,
    gold_candidate: parsed.gold_candidate === true && qTier === "gold" && !isPrivate,
    use_in_rag: isPrivate ? false : parsed.use_in_rag === true,
    use_in_generation: isPrivate ? false : parsed.use_in_generation === true,
    requires_redaction: parsed.requires_redaction === true || isPrivate,
    contains_personal_data: parsed.contains_personal_data === true || isPrivate,
    contains_passport_data: parsed.contains_passport_data === true,
    contains_bank_data: parsed.contains_bank_data === true,
    short_summary: typeof parsed.short_summary === "string" ? parsed.short_summary.slice(0, 1200) : "",
    rag_title: typeof parsed.rag_title === "string" ? parsed.rag_title.slice(0, 240) : row.title,
    ai_analysis_court: parsed.court ?? null,
    ai_analysis_contract: parsed.contract ?? null,
    ai_analysis_real_estate: parsed.real_estate ?? null,
    ai_analysis_status: "analyzed",
    ai_analysis_at: new Date().toISOString(),
    ai_analysis_version: AI_ANALYSIS_VERSION,
    ai_analysis_by_user: userId,
  };

  const { error: upErr } = await (supabase.from("lawyer_archive_items") as any)
    .update({ metadata: newMd })
    .eq("id", row.id);
  if (upErr) throw new Error(upErr.message);
}

export const archiveAiAnalyzeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        batch_id: z.string().trim().min(1).max(120).optional(),
        only_pending: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY не сконфигурирован");

    let q = supabase
      .from("lawyer_archive_items")
      .select("id, title, content, metadata")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.batch_id) q = q.eq("metadata->>archive_batch_id", data.batch_id);
    if (data.only_pending !== false) {
      // Only items not yet analyzed (or older version).
      q = q.or(
        `metadata->>ai_analysis_status.is.null,metadata->>ai_analysis_status.neq.analyzed,metadata->>ai_analysis_version.neq.${AI_ANALYSIS_VERSION}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let analyzed = 0;
    let failed = 0;
    let skipped = 0;
    const errors: { id: string; title: string; error: string }[] = [];

    const runOne = async (r: any) => {
      try {
        const before = ((r.metadata ?? {}) as any).ai_analysis_status;
        await analyzeOneArchiveItem(supabase, userId, r, apiKey);
        // Re-read status to count skipped vs analyzed
        const { data: after } = await (supabase.from("lawyer_archive_items") as any)
          .select("metadata")
          .eq("id", r.id)
          .maybeSingle();
        const status = after?.metadata?.ai_analysis_status;
        if (status === "skipped_no_text") skipped += 1;
        else analyzed += 1;
        void before;
      } catch (e: any) {
        failed += 1;
        errors.push({ id: r.id, title: r.title, error: e?.message ?? String(e) });
      }
    };
    // Parallel — each call ~3-6s; sequential 10× exceeds wall time.
    await Promise.allSettled((rows ?? []).map(runOne));

    let pq = (supabase.from("lawyer_archive_items") as any)
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(
        `metadata->>ai_analysis_status.is.null,metadata->>ai_analysis_status.neq.analyzed,metadata->>ai_analysis_version.neq.${AI_ANALYSIS_VERSION}`,
      );
    if (data.batch_id) pq = pq.eq("metadata->>archive_batch_id", data.batch_id);
    const { count: remaining } = await pq;

    return {
      processed: (rows ?? []).length,
      analyzed,
      skipped,
      failed,
      remaining: remaining ?? 0,
      errors: errors.slice(0, 20),
    };
  });

export const archiveGetAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("lawyer_archive_items")
      .select("id, title, metadata")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Не найдено");
    const md = (row.metadata ?? {}) as any;
    return {
      id: row.id,
      title: row.title,
      analysis: {
        status: md.ai_analysis_status ?? null,
        version: md.ai_analysis_version ?? null,
        at: md.ai_analysis_at ?? null,
        document_role: md.document_role ?? null,
        practice_area: md.practice_area ?? null,
        quality_score: md.quality_score ?? null,
        quality_tier: md.quality_tier ?? null,
        gold_candidate: md.gold_candidate ?? false,
        use_in_rag: md.use_in_rag ?? false,
        use_in_generation: md.use_in_generation ?? false,
        requires_redaction: md.requires_redaction ?? false,
        contains_personal_data: md.contains_personal_data ?? false,
        contains_passport_data: md.contains_passport_data ?? false,
        contains_bank_data: md.contains_bank_data ?? false,
        short_summary: md.short_summary ?? "",
        rag_title: md.rag_title ?? row.title,
        legal_topics: md.legal_topics ?? [],
        key_facts: md.key_facts ?? [],
        key_risks: md.key_risks ?? [],
        court: md.ai_analysis_court ?? null,
        contract: md.ai_analysis_contract ?? null,
        real_estate: md.ai_analysis_real_estate ?? null,
      },
    };
  });

