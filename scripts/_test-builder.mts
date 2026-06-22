import { tryBuildDocumentContext } from "/dev-server/src/lib/document-context-builder.ts";
import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL as string);
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (process.env.SUPABASE_PUBLISHABLE_KEY as string);
const sb = createClient(url, key);

const { data, error } = await sb
  .from("document_intake_ai_runs")
  .select("id, ai_result")
  .eq("id", "38273bc9-1f27-4b89-9323-f3d4de7bbbf3")
  .maybeSingle();
if (error) throw error;

const result = tryBuildDocumentContext(data!.ai_result as any);
if (!result.ok) {
  console.log("FAIL", result);
  process.exit(1);
}
const c = result.context;
console.log(JSON.stringify({
  ok: true,
  quality: c.document_context_quality,
  breakdown: c.document_context_quality_breakdown,
  counts: {
    facts: c.facts.items.length,
    applicable_laws: c.applicable_laws.items.length,
    court_practice: c.court_practice.items.length,
    fns_letters: c.fns_letters.items.length,
    minfin_letters: c.minfin_letters.items.length,
    ekaterina_practice: c.ekaterina_practice.items.length,
    counter_arguments: c.counter_arguments.items.length,
    weak_points: c.weak_points.items.length,
    missing_evidence: c.missing_evidence.items.length,
    generation_instructions: c.generation_instructions.length,
    documents_used: c.documents_used.length,
    documents_rejected: c.documents_rejected.length,
    sources: c.sources.length,
    fact_to_law_mapping: c.fact_to_law_mapping.length,
    fact_to_evidence_mapping: c.fact_to_evidence_mapping.length,
  },
  fact_to_evidence_sample: c.fact_to_evidence_mapping.slice(0, 3),
  generation_instructions_sample: c.generation_instructions.slice(0, 6),
  summary: c.document_context_summary,
}, null, 2));
