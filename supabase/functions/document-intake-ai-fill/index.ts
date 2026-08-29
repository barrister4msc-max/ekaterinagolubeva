import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  AiFillRedactionError,
  buildModelFacingDocumentText,
  extractProtectedAnswerCandidates,
  prepareSafeAiFillDocuments,
} from "./redaction-safety.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!accessToken) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin_or_superadmin", {
      _user_id: user.id,
    });

    if (roleError) {
      throw new Error("Unable to verify access");
    }

    if (isAdmin !== true) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const { session_id, document_id, document_ids, trigger, allow_unredacted_text } = await req.json();
    const requestedDocumentIds = Array.from(
      new Set(
        (Array.isArray(document_ids) ? document_ids : [document_id])
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    if (!session_id || requestedDocumentIds.length === 0) {
      return json(
        {
          success: false,
          error: "session_id and document_id or document_ids are required",
        },
        400,
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("document_intake_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      throw new Error("Intake session not found");
    }

    const { data: documents, error: documentError } = await supabase
      .from("documents")
      .select("*")
      .in("id", requestedDocumentIds);

    if (documentError || !documents || documents.length !== requestedDocumentIds.length) {
      throw new Error("One or more documents were not found");
    }

    for (const document of documents) {
      const metadata = (document.metadata ?? {}) as Record<string, unknown>;
      if (metadata.intake_session_id !== session_id) {
        throw new Error("Document does not belong to the intake session");
      }
    }

    let readyDocuments;
    try {
      readyDocuments = allow_unredacted_text === true
        ? prepareSafeAiFillDocuments(documents, { allowUnredactedText: true })
        : prepareSafeAiFillDocuments(documents);
    } catch (error) {
      if (error instanceof AiFillRedactionError) {
        return json({ success: false, error: error.message }, 409);
      }
      throw error;
    }

    if (readyDocuments.length === 0) {
      return json(
        {
          success: false,
          error: "Document has no extracted text. Run extract-document-text first.",
        },
        400,
      );
    }

    const documentTextForAiFill = buildModelFacingDocumentText(readyDocuments);

    const primaryDocument = readyDocuments[0].document;
    const allowedDocumentIds = new Set(readyDocuments.map((item) => item.document.id));

    const { data: schema, error: schemaError } = await supabase
      .from("document_intake_schemas")
      .select("*")
      .eq("template_code", session.template_code)
      .eq("language", session.language)
      .or(`jurisdiction.eq.${session.jurisdiction},jurisdiction.is.null`)
      .order("jurisdiction", { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    if (schemaError || !schema) {
      throw new Error("Intake schema not found");
    }

    const fields = extractFields(schema.schema_json);

    const { data: existingAnswers, error: existingAnswersError } = await supabase
      .from("document_intake_answers")
      .select("field_name, value_source")
      .eq("session_id", session_id);

    if (existingAnswersError) {
      throw existingAnswersError;
    }

    const existingAnswerSources = new Map(
      (existingAnswers ?? []).map((answer) => [
        String(answer.field_name),
        String(answer.value_source ?? ""),
      ]),
    );
    const protectedAnswerCandidates = extractProtectedAnswerCandidates(documents, fields);
    const protectedFieldNames = new Set(
      protectedAnswerCandidates.map((candidate) => candidate.field_name),
    );

    let protectedInserted = 0;
    for (const candidate of protectedAnswerCandidates) {
      const existingSource = existingAnswerSources.get(candidate.field_name);
      if (existingSource && existingSource !== "ai_document") {
        continue;
      }

      const { error } = await supabase.from("document_intake_answers").upsert(
        {
          session_id,
          field_name: candidate.field_name,
          field_label: candidate.field_label,
          field_value: candidate.value,
          value_source: "document_local",
          confidence: 0.98,
          source_document_id: candidate.source_document_id,
          source_quote: "[извлечено локально из исходного OCR; оригинал не передавался модели]",
          needs_review: true,
          is_verified: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id,field_name" },
      );

      if (error) {
        throw error;
      }
      protectedInserted += 1;
    }

    // Explicit run identity. Every AI-fill (auto or manual) owns one
    // document_intake_ai_runs row; consumers must reference this id directly
    // instead of resolving "the latest run for the session".
    const { data: runRow, error: runError } = await supabase
      .from("document_intake_ai_runs")
      .insert({
        session_id,
        run_type: "intake_ai_fill",
        status: "running",
        input_snapshot: {
          document_ids: readyDocuments.map((item) => item.document.id),
          template_code: session.template_code,
          trigger: typeof trigger === "string" ? trigger : "manual",
        },
        model_name: "gemini",
      })
      .select("id")
      .single();

    if (runError || !runRow) {
      throw new Error("Unable to create intake AI run");
    }

    const aiFillRunId: string = runRow.id;

    const caseIntelligenceMatrix =
      ((session.metadata ?? {}) as Record<string, any>)?.case_intelligence_matrix ?? null;

    let aiResult;
    try {
      aiResult = await extractAnswersWithGemini({
        apiKey: geminiApiKey,
        documentText: documentTextForAiFill,
        caseIntelligenceMatrix,
        fields,
        templateCode: session.template_code,
      });
    } catch (error) {
      await supabase
        .from("document_intake_ai_runs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", aiFillRunId);
      throw error;
    }


    const rawAnswers = Array.isArray(aiResult.answers) ? aiResult.answers : [];

    const answers = sanitizeAnswers(rawAnswers);
    const fieldPolicy: Record<string, "identity" | "authority" | "fact" | "legal"> = {
      taxpayer_name: "identity",
      taxpayer_inn: "identity",
      ogrn: "identity",
      ogrnip: "identity",
      client_name: "identity",
      person_name: "identity",
      counterparty_name: "identity",
      counterparty_inn: "identity",

      representative_name: "authority",
      principal_name: "authority",
      authorized_person: "authority",
      power_of_attorney_date: "authority",
      power_of_attorney_number: "authority",

      tax_residency: "fact",
      country_of_residence: "fact",
      registration_address: "fact",
      contract_date: "fact",
      contract_number: "fact",
      disputed_operations: "fact",

      fns_position: "legal",
      fns_claim_type: "legal",
      tax_control_type: "legal",
      tax_type: "legal",
      tax_amount: "legal",
      business_purpose: "legal",
      reconstruction_possible: "legal",
      defense_position: "legal",
    };

    const allowedAnswers = answers.filter((answer) => {
      const confidence = Number(answer.confidence ?? 0);
      const value = answer.value;
      const fieldName = String(answer.field_name ?? "");

      // Canonical locally extracted/manual values must never be overwritten by
      // a model placeholder or a lower-fidelity interpretation.
      if (protectedFieldNames.has(fieldName)) return false;

      // A saved human/lawyer/local/registry value is authoritative for this
      // rerun. Only a previous AI proposal may be replaced by a new AI
      // proposal; the upsert below shares the same session/field key.
      const existingSource = existingAnswerSources.get(fieldName);
      if (existingSource && existingSource !== "ai_document") return false;

      const quote = typeof answer.source_quote === "string" ? answer.source_quote.trim() : "";
      const sourceDocumentId =
        typeof answer.source_document_id === "string" ? answer.source_document_id : "";

      const hasSourceQuote = quote.length > 0;

      const isEmptyLike =
        value === null ||
        value === undefined ||
        value === "" ||
        value === "Не указана" ||
        value === "unclear" ||
        (Array.isArray(value) && value.length === 0);

      const templateDerived =
        quote.toLowerCase().includes("template_code") ||
        quote.toLowerCase().includes("template code");

      const role = aiResult?.document_role ?? {};
      const policy = fieldPolicy[fieldName] ?? "fact";
      // A multi-document packet has no single document role. In that mode,
      // source_document_id + source_quote are the authority; the model's
      // aggregate role must not discard facts from other documents.
      const enforceAggregateRole = readyDocuments.length === 1;

      if (isEmptyLike) return false;
      if (confidence < 0.75) return false;
      if (!hasSourceQuote) return false;
      if (readyDocuments.length > 1 && !allowedDocumentIds.has(sourceDocumentId)) return false;
      if (templateDerived) return false;

      if (enforceAggregateRole && policy === "identity" && role.can_fill_identity !== true) return false;
      if (enforceAggregateRole && policy === "authority" && role.can_fill_authority !== true) return false;
      if (enforceAggregateRole && policy === "fact" && role.can_fill_facts !== true) return false;
      if (enforceAggregateRole && policy === "legal" && role.can_fill_legal_position !== true) return false;

      return true;
    });

    let inserted = protectedInserted;

    for (const answer of allowedAnswers) {
      if (!answer.field_name || answer.value === undefined || answer.value === null) {
        continue;
      }

      await supabase.from("document_intake_answers").upsert(
        {
          session_id,
          field_name: answer.field_name,
          field_label: answer.field_label ?? answer.field_name,
          field_value: answer.value,
          value_source: "ai_document",
          confidence: answer.confidence ?? 0.7,
          source_document_id:
            typeof answer.source_document_id === "string" &&
            allowedDocumentIds.has(answer.source_document_id)
              ? answer.source_document_id
              : primaryDocument.id,
          source_quote: answer.source_quote ?? null,
          source_page: answer.source_page ?? null,
          needs_review: true,
          is_verified: false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "session_id,field_name",
        },
      );

      inserted++;
    }

    await supabase
      .from("documents")
      .update({
        ai_summary: aiResult.summary ?? null,
        ai_detected_entities: aiResult.detected_entities ?? null,
        ai_detected_risks: aiResult.detected_risks ?? null,
        analysis_status: "intake_filled",
        updated_at: new Date().toISOString(),
      })
      .in("id", readyDocuments.map((item) => item.document.id));

    await supabase
      .from("document_intake_ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        ai_result: {
          filled_fields: inserted,
          total_candidate_fields: fields.length,
          summary: aiResult.summary ?? null,
          answers: allowedAnswers,
          protected_fields: protectedInserted,
        },
      })
      .eq("id", aiFillRunId);

    const sessionMetadata = ((session.metadata ?? {}) as Record<string, unknown>) ?? {};

    await supabase
      .from("document_intake_sessions")
      .update({
        document_id: primaryDocument.id,
        ai_summary: aiResult.summary ?? null,
        ai_risk_level: aiResult.risk_level ?? null,
        ai_recommended_action: aiResult.recommended_action ?? null,
        metadata: {
          ...sessionMetadata,
          intake_ai_fill: {
            run_id: aiFillRunId,
            document_ids: readyDocuments.map((item) => item.document.id),
            filled_fields: inserted,
            completed_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return json({
      success: true,
      session_id,
      run_id: aiFillRunId,
      document_id: primaryDocument.id,
      document_ids: readyDocuments.map((item) => item.document.id),
      filled_fields: inserted,
