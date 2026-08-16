import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  buildAutofillPlan,
  buildCompanyMetadataPatch,
  buildMatterTitle,
  decideMatterAction,
  detectCompanyConflicts,
  extractDocumentCompanyProfile,
  fetchDaDataParty,
  isValidInn,
  mapMatterType,
  MATTER_SOURCE_TYPE,
  mergeMetadata,
  normalizeInn,
  REGISTRY_VALUE_SOURCE,
  selectRegistryCandidate,
  type AnswerRow,
  type CompanyRegistryConflict,
  type CompanyRegistryProfile,
  type DocumentCompanyProfile,
  type RegistryLookupStatus,
} from "@/lib/company-registry";

export type CompanyRegistryLookupResult = {
  success: boolean;
  status: RegistryLookupStatus | "invalid_inn" | "matter_creation_blocked";
  inn: string;
  checked_at: string;
  provider: "dadata";
  profile: CompanyRegistryProfile | null;
  document_profile: DocumentCompanyProfile | null;
  conflicts: CompanyRegistryConflict[];
  candidates: CompanyRegistryProfile[];
  autofilled_fields: string[];
  matter_id: string | null;
  matter_blocked_reason: string | null;
  error?: string;
};

export const lookupCompanyRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { session_id: string; inn: string }) => data)
  .handler(async ({ data, context }): Promise<CompanyRegistryLookupResult> => {
    const checkedAt = new Date().toISOString();
    const inn = normalizeInn(data?.inn);

    const base: CompanyRegistryLookupResult = {
      success: false,
      status: "invalid_inn",
      inn,
      checked_at: checkedAt,
      provider: "dadata",
      profile: null,
      document_profile: null,
      conflicts: [],
      candidates: [],
      autofilled_fields: [],
      matter_id: null,
      matter_blocked_reason: null,
    };

    if (!data?.session_id || !isValidInn(inn)) {
      return { ...base, error: "ИНН должен содержать 10 или 12 цифр" };
    }

    // Authorization — lawyer/admin workspace only.
    const { data: isAdmin, error: roleError } = await context.supabase.rpc(
      "is_admin_or_superadmin",
      { _user_id: context.userId },
    );
    if (roleError) throw new Error("Unable to verify access");
    if (isAdmin !== true) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("document_intake_sessions")
      .select("*")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Intake session not found");

    const { data: answerRows } = await supabaseAdmin
      .from("document_intake_answers")
      .select("field_name, field_value, value_source, is_verified")
      .eq("session_id", data.session_id);
    const answers = (answerRows ?? []) as AnswerRow[];
    const documentProfile = extractDocumentCompanyProfile(answers);

    // --- provider ---------------------------------------------------------
    const fetched = await fetchDaDataParty({
      inn,
      apiKey: process.env["DADATA_API_KEY"],
    });

    let status: RegistryLookupStatus;
    let profile: CompanyRegistryProfile | null = null;
    let candidates: CompanyRegistryProfile[] = [];

    if (fetched.status === "registry_not_configured") {
      status = "registry_not_configured";
    } else if (fetched.status === "provider_error") {
      status = "provider_error";
    } else {
      const selection = selectRegistryCandidate(fetched.suggestions, inn, checkedAt);
      status = selection.status;
      if (selection.status === "verified") profile = selection.profile;
      if (selection.status === "ambiguous_candidates") candidates = selection.candidates;
    }

    const conflicts = profile ? detectCompanyConflicts(documentProfile, profile) : [];

    // --- persist session metadata (safe merge) ----------------------------
    const patch = buildCompanyMetadataPatch({
      profile,
      documentProfile,
      conflicts,
      status,
      inn,
      checkedAt,
      provider: "dadata",
    });
    const sessionMetadata = mergeMetadata((session as any).metadata, patch);
    await supabaseAdmin
      .from("document_intake_sessions")
      .update({ metadata: sessionMetadata as any, updated_at: checkedAt })
      .eq("id", data.session_id);

    if (!profile) {
      return {
        ...base,
        success: status !== "provider_error",
        status,
        document_profile: documentProfile,
        candidates,
        matter_id: (session as any).matter_id ?? null,
      };
    }

    // --- intake autofill (never overwrites manual/lawyer values) ----------
    const schemaFieldKeys = await loadSchemaFieldKeys(
      supabaseAdmin,
      (session as any).template_code,
    );
    const plan = buildAutofillPlan({ profile, answers, schemaFieldKeys });
    if (plan.length > 0) {
      await supabaseAdmin.from("document_intake_answers").upsert(
        plan.map((entry) => ({
          session_id: data.session_id,
          field_name: entry.field_name,
          field_label: entry.field_label,
          field_value: entry.field_value as any,
          value_source: REGISTRY_VALUE_SOURCE,
          confidence: 1,
          needs_review: false,
          is_verified: false,
        })),
        { onConflict: "session_id,field_name" },
      );
    }

    // --- matter link / creation (idempotent) ------------------------------
    let matterId: string | null = (session as any).matter_id ?? null;
    let matterBlockedReason: string | null = null;

    const { data: linkedMatters } = await supabaseAdmin
      .from("legal_matters")
      .select("id, metadata")
      .filter("metadata->>intake_session_id", "eq", data.session_id)
      .limit(5);

    const decision = decideMatterAction({
      sessionMatterId: matterId,
      existingMatters: (linkedMatters ?? []) as Array<{
        id: string;
        metadata: Record<string, unknown> | null;
      }>,
      sessionId: data.session_id,
    });

    if (decision.action === "create") {
      const { data: created, error: createError } = await supabaseAdmin
        .from("legal_matters")
        .insert({
          matter_type: mapMatterType((session as any).template_code),
          source_type: MATTER_SOURCE_TYPE,
          title: buildMatterTitle({
            companyName: profile.name_short ?? profile.name_full,
            templateCode: (session as any).template_code,
          }),
          created_by: (session as any).created_by ?? null,
          client_id: (session as any).client_id ?? null,
          lead_id: (session as any).lead_id ?? null,
          metadata: {
            intake_session_id: data.session_id,
            template_code: (session as any).template_code,
            ...patch,
          } as any,
        })
        .select("id")
        .single();

      if (createError || !created) {
        matterBlockedReason = "matter_insert_failed";
      } else {
        matterId = created.id;
        await supabaseAdmin
          .from("document_intake_sessions")
          .update({ matter_id: matterId, updated_at: checkedAt })
          .eq("id", data.session_id);
      }
    } else {
      matterId = decision.matter_id;
      const { data: matterRow } = await supabaseAdmin
        .from("legal_matters")
        .select("metadata")
        .eq("id", matterId)
        .maybeSingle();
      await supabaseAdmin
        .from("legal_matters")
        .update({
          metadata: mergeMetadata((matterRow as any)?.metadata, {
            intake_session_id: data.session_id,
            ...patch,
          }) as any,
          updated_at: checkedAt,
        })
        .eq("id", matterId);

      if (!(session as any).matter_id) {
        await supabaseAdmin
          .from("document_intake_sessions")
          .update({ matter_id: matterId, updated_at: checkedAt })
          .eq("id", data.session_id);
      }
    }

    return {
      success: true,
      status: matterBlockedReason ? "matter_creation_blocked" : "verified",
      inn,
      checked_at: checkedAt,
      provider: "dadata",
      profile,
      document_profile: documentProfile,
      conflicts,
      candidates: [],
      autofilled_fields: plan.map((entry) => entry.field_name),
      matter_id: matterId,
      matter_blocked_reason: matterBlockedReason,
    };
  });

async function loadSchemaFieldKeys(
  client: { from: (table: string) => any },
  templateCode: string | null,
): Promise<string[]> {
  if (!templateCode) return [];
  const { data } = await client
    .from("document_intake_schemas")
    .select("schema_json")
    .eq("template_code", templateCode)
    .eq("is_active", true);

  const keys = new Set<string>();
  for (const row of (data ?? []) as Array<{ schema_json: any }>) {
    for (const step of row.schema_json?.steps ?? []) {
      for (const field of step?.fields ?? []) {
        const key = field?.key ?? field?.name;
        if (typeof key === "string") keys.add(key);
      }
    }
  }
  return Array.from(keys);
}
