import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    ..in("role", ["admin", "super_admin"])
    .maybeSingle();
  if (error) throw new Error("Не удалось проверить роль");
  if (!data) throw new Error("Доступ только для администратора");
}

export const listLeadsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["new", "in_progress", "waiting", "closed"]).optional(),
        category: z.string().max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { leads: rows ?? [] };
  });

export const updateLeadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
  z
    .object({
      id: z.string().uuid(),

      status: z.enum([
        "new",
        "in_progress",
        "waiting",
        "closed",
      ]).optional(),

      pipeline_stage: z.enum([
        "new",
        "contacted",
        "waiting_documents",
        "analysis",
        "offer_sent",
        "in_work",
        "court",
        "closed",
        "lost",
      ]).optional(),

      priority: z.enum([
        "low",
        "normal",
        "high",
        "urgent",
      ]).optional(),

      estimated_budget: z.number().nullable().optional(),

      next_followup_at: z.string().nullable().optional(),

      admin_notes: z.string().max(5000).nullable().optional(),
    })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: {
  status?: "new" | "in_progress" | "waiting" | "closed";

  pipeline_stage?:
    | "new"
    | "contacted"
    | "waiting_documents"
    | "analysis"
    | "offer_sent"
    | "in_work"
    | "court"
    | "closed"
    | "lost";

  priority?: "low" | "normal" | "high" | "urgent";

  estimated_budget?: number | null;

  next_followup_at?: string | null;

  admin_notes?: string | null;
} = {};
    if (data.status !== undefined)
  patch.status = data.status;

if (data.pipeline_stage !== undefined)
  patch.pipeline_stage = data.pipeline_stage;

if (data.priority !== undefined)
  patch.priority = data.priority;

if (data.estimated_budget !== undefined)
  patch.estimated_budget = data.estimated_budget;

if (data.next_followup_at !== undefined)
  patch.next_followup_at = data.next_followup_at;

if (data.admin_notes !== undefined)
  patch.admin_notes = data.admin_notes;
    const { error } = await supabaseAdmin.from("leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
