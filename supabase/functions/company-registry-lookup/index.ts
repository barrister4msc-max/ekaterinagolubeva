import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
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
} from "../../../src/lib/company-registry.ts";
import {
  buildCanonicalRegistryOverrides,
  filterFormattingOnlyConflicts,
  getPreservedDocumentBusinessActivity,
} from "../../../src/lib/company-registry-canonical.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LookupResult = {
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

function asDocumentProfile(value: unknown): DocumentCompanyProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<DocumentCompanyProfile>;
  const keys: Array<keyof DocumentCompanyProfile> = [
    "taxpayer_name",
    "taxpayer_inn",
    "taxpayer_ogrn",
    "taxpayer_kpp",
    "taxpayer_legal_address",
    "okved_main",
    "business_activity",
  ];
  const result = {} as DocumentCompanyProfile;
  let hasValue = false;
  for (const key of keys) {
    const raw = candidate[key];
    result[key] = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    if (result[key]) hasValue = true;
  }
  return hasValue ? result : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const checkedAt = new Date().toISOString();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Server configuration error");

    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return json({ success: false, error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return json({ success: false, error: "Unauthorized" }, 401);

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin_or_superadmin", {
      _user_id: user.id,
    });
    if (roleError) throw new Error("Unable to verify access");
    if (isAdmin !== true) return json({ success: false, error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";
    const inn = normalizeInn(body?.inn);

    const base: LookupResult = {
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

    if (!sessionId || !isValidInn(inn)) {
      return json({ ...base, error: "ИНН должен содержать 10 или 12 цифр" }, 400);
    }

    const { data: session, error: sessionError } = await supabase
      .from("document_intake_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return json({ ...base, error: "Intake session not found" }, 404);

    const { data: answerRows, error: answerError } = await supabase
      .from("document_intake_answers")
      .select("field_name, field_value, value_source, is_verified")
      .eq("session_id", sessionId);
    if (answerError) throw answerError;

    const answers = (answerRows ?? []) as AnswerRow[];
    // Once captured, the original document/OCR layer must never be replaced by
    // later registry-generated answers. This keeps the legal evidence layer intact.
    const metadata = session.metadata && typeof session.metadata === "object"
      ? session.metadata as Record<string, unknown>
      : {};
    const documentProfile =
      asDocumentProfile(metadata.document_company_profile) ?? extractDocumentCompanyProfile(answers);

    const fetched = await fetchDaDataParty({
      inn,
      apiKey: Deno.env.get("DADATA_API_KEY"),
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

    const rawConflicts = profile ? detectCompanyConflicts(documentProfile, profile) : [];
    const conflicts = profile ? filterFormattingOnlyConflicts(rawConflicts, profile) : [];
    const patch = buildCompanyMetadataPatch({
      profile,
      documentProfile,
      conflicts,
      status,
      inn,
      checkedAt,
      provider: "dadata",
    });
    const sessionMetadata = mergeMetadata(session.metadata, patch);

    const { error: sessionUpdateError } = await supabase
      .from("document_intake_sessions")
      .update({ metadata: sessionMetadata, updated_at: checkedAt })
      .eq("id", sessionId);
    if (sessionUpdateError) throw sessionUpdateError;

    if (!profile) {
      return json({
        ...base,
        success: status !== "provider_error",
        status,
        document_profile: documentProfile,
        candidates,
        matter_id: session.matter_id ?? null,
      });
    }

    const schemaFieldKeys = await loadSchemaFieldKeys(supabase, session.template_code);
    const plan = buildCanonicalRegistryOverrides({
      profile,
      answers,
      schemaFieldKeys,
      conflicts,
    });
    if (plan.length > 0) {
      const { error: upsertError } = await supabase.from("document_intake_answers").upsert(
        plan.map((entry) => ({
          session_id: sessionId,
          field_name: entry.field_name,
          field_label: entry.field_label,
          field_value: entry.field_value,
          value_source: REGISTRY_VALUE_SOURCE,
          confidence: 1,
          needs_review: false,
          is_verified: true,
        })),
        { onConflict: "session_id,field_name" },
      );
      if (upsertError) throw upsertError;
    }

    // DaData may return the verified OKVED code but omit its text name. In that
    // case never degrade a useful document description to "68.20". If a prior
    // registry run already did so, restore the preserved document description.
    const preservedBusinessActivity = getPreservedDocumentBusinessActivity({
      profile,
      documentProfile,
      answers,
    });
    if (preservedBusinessActivity) {
      const { error: restoreError } = await supabase.from("document_intake_answers").upsert({
        session_id: sessionId,
        field_name: "business_activity",
        field_label: "Сфера деятельности",
        field_value: preservedBusinessActivity,
        value_source: "document_preserved",
        confidence: null,
        needs_review: false,
        is_verified: false,
      }, { onConflict: "session_id,field_name" });
      if (restoreError) throw restoreError;
    }

    let matterId: string | null = session.matter_id ?? null;
    let matterBlockedReason: string | null = null;

    const { data: linkedMatters, error: linkedError } = await supabase
      .from("legal_matters")
      .select("id, metadata")
      .filter("metadata->>intake_session_id", "eq", sessionId)
      .limit(5);
    if (linkedError) throw linkedError;

    const decision = decideMatterAction({
      sessionMatterId: matterId,
      existingMatters: linkedMatters ?? [],
      sessionId,
    });

    if (decision.action === "create") {
      const { data: existingNow } = await supabase
        .from("legal_matters")
        .select("id, metadata")
        .filter("metadata->>intake_session_id", "eq", sessionId)
        .limit(1)
        .maybeSingle();

      if (existingNow?.id) {
        matterId = existingNow.id;
      } else {
        const { data: created, error: createError } = await supabase
          .from("legal_matters")
          .insert({
            matter_type: mapMatterType(session.template_code),
            source_type: MATTER_SOURCE_TYPE,
            title: buildMatterTitle({
              companyName: profile.name_short ?? profile.name_full,
              templateCode: session.template_code,
            }),
            created_by: session.created_by ?? user.id,
            client_id: session.client_id ?? null,
            lead_id: session.lead_id ?? null,
            metadata: {
              intake_session_id: sessionId,
              template_code: session.template_code,
              ...patch,
            },
          })
          .select("id")
          .single();

        if (createError || !created) matterBlockedReason = "matter_insert_failed";
        else matterId = created.id;
      }
    } else {
      matterId = decision.matter_id;
    }

    if (matterId) {
      const { data: matterRow, error: matterReadError } = await supabase
        .from("legal_matters")
        .select("metadata")
        .eq("id", matterId)
        .maybeSingle();
      if (matterReadError) throw matterReadError;

      const { error: matterUpdateError } = await supabase
        .from("legal_matters")
        .update({
          metadata: mergeMetadata(matterRow?.metadata, {
            intake_session_id: sessionId,
            ...patch,
          }),
          updated_at: checkedAt,
        })
        .eq("id", matterId);
      if (matterUpdateError) throw matterUpdateError;

      if (!session.matter_id) {
        const { error: linkError } = await supabase
          .from("document_intake_sessions")
          .update({ matter_id: matterId, updated_at: checkedAt })
          .eq("id", sessionId)
          .is("matter_id", null);
        if (linkError) throw linkError;
      }
    }

    const updatedFields = plan.map((entry) => entry.field_name);
    if (preservedBusinessActivity && !updatedFields.includes("business_activity")) {
      updatedFields.push("business_activity");
    }

    return json({
      success: true,
      status: matterBlockedReason ? "matter_creation_blocked" : "verified",
      inn,
      checked_at: checkedAt,
      provider: "dadata",
      profile,
      document_profile: documentProfile,
      conflicts,
      candidates: [],
      autofilled_fields: updatedFields,
      matter_id: matterId,
      matter_blocked_reason: matterBlockedReason,
    } satisfies LookupResult);
  } catch (error) {
    console.error("[company-registry-lookup] failed", error instanceof Error ? error.message : "unknown_error");
    return json({ success: false, error: "Company registry lookup failed" }, 500);
  }
});

type SchemaReader = {
  from(table: string): any;
};

async function loadSchemaFieldKeys(client: SchemaReader, templateCode: string | null) {
  if (!templateCode) return [] as string[];
  const { data, error } = await client
    .from("document_intake_schemas")
    .select("schema_json")
    .eq("template_code", templateCode)
    .eq("is_active", true);
  if (error) throw error;

  const keys = new Set<string>();
  for (const row of data ?? []) {
    const schema = row.schema_json as Record<string, unknown> | null;
    const steps = Array.isArray((schema as any)?.steps) ? (schema as any).steps : [];
    for (const step of steps) {
      for (const field of Array.isArray(step?.fields) ? step.fields : []) {
        const key = field?.key ?? field?.name;
        if (typeof key === "string") keys.add(key);
      }
    }
  }
  return Array.from(keys);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
