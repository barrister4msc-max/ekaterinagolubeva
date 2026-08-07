import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { CANONICAL_CONSUMER_OBSERVER_VERSION } from "../_shared/legal-analysis/canonical-relations/index.ts";
import { buildCanonicalReadinessReport, type CanonicalReadinessObservation } from "./readiness.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("authorization") ?? "";
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "forbidden" }, 403);
  }
  if (!supabaseUrl) return json({ error: "readiness_unavailable" }, 503);

  const client = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await client
    .from("document_intake_canonical_consumer_observations")
    .select(
      "analysis_run_id,schema_version,observer_version,outcome,fallback_reason,mismatch_reasons,claim_count,relation_count,ordered_equality,duplicate_equality,coverage_equality,identity_equality,per_conclusion_equality,reverse_index_equality,observed_at",
    )
    .eq("observer_version", CANONICAL_CONSUMER_OBSERVER_VERSION)
    .order("observed_at", { ascending: false })
    .limit(1000);

  if (error) return json({ error: "readiness_unavailable" }, 503);
  return json(
    buildCanonicalReadinessReport(
      (Array.isArray(data) ? data : []) as CanonicalReadinessObservation[],
    ),
  );
});
