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
      ...(row.metadata ?? {}),
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
    const md = item.metadata ?? {};
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

export const archivePracticeStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("lawyer_archive_items")
      .select("item_type, metadata")
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
      const area = md.practice_area || "other";
      const s = bump(area);
      s.total += 1;
      if (md.document_role === "gold_reference") s.gold += 1;
      if (r.item_type === "template" || md.template_approved) s.templates += 1;
      if (!md.classification_status || md.classification_status === "pending") s.unclassified += 1;
      if (md.requires_lawyer_approval && !md.approved_at) s.pending_approval += 1;
    }
    return { stats };
  });
