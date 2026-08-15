import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

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

    const { session_id, document_id, document_ids } = await req.json();
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

    const packageDocuments = documents.map((document) => {
      const metadata = (document.metadata ?? {}) as Record<string, unknown>;
      if (metadata.intake_session_id !== session_id) {
        throw new Error("Document does not belong to the intake session");
      }
      const originalText =
        typeof metadata.original_ocr_text === "string" ? metadata.original_ocr_text.trim() : "";
      const currentText = typeof document.ocr_text === "string" ? document.ocr_text.trim() : "";
      const text = originalText || currentText;
      const isRedactedOnly =
        !originalText &&
        /\[(COMPANY|PERSON|BANK_DETAILS|PASSPORT|ADDRESS|DATE|DOCUMENT_NUMBER)_\d+\]/i.test(
          currentText,
        );
      return { document, text, isRedactedOnly };
    });

    const readyDocuments = packageDocuments.filter((item) => item.text.length > 0);
    if (readyDocuments.length === 0) {
      return json(
        {
          success: false,
          error: "Document has no extracted text. Run extract-document-text first.",
        },
        400,
      );
    }

    if (readyDocuments.some((item) => item.isRedactedOnly)) {
      return json(
        {
          success: false,
          error:
            "AI fill blocked: only redacted text is available. original_ocr_text is required for filling the card.",
        },
        400,
      );
    }

    const documentTextForAiFill = readyDocuments
      .map(({ document, text }, index) =>
        [
          `=== DOCUMENT ${index + 1} ===`,
          `document_id: ${document.id}`,
          `file_name: ${document.file_name ?? document.title ?? "unknown"}`,
          text.slice(0, 45_000),
        ].join("\n"),
      )
      .join("\n\n")
      .slice(0, 120_000);

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

    const caseIntelligenceMatrix =
      ((session.metadata ?? {}) as Record<string, any>)?.case_intelligence_matrix ?? null;

    const aiResult = await extractAnswersWithGemini({
      apiKey: geminiApiKey,
      documentText: documentTextForAiFill,
      caseIntelligenceMatrix,
      fields,
      templateCode: session.template_code,
    });

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

      if (isEmptyLike) return false;
      if (confidence < 0.75) return false;
      if (!hasSourceQuote) return false;
      if (readyDocuments.length > 1 && !allowedDocumentIds.has(sourceDocumentId)) return false;
      if (templateDerived) return false;

      if (policy === "identity" && role.can_fill_identity !== true) return false;
      if (policy === "authority" && role.can_fill_authority !== true) return false;
      if (policy === "fact" && role.can_fill_facts !== true) return false;
      if (policy === "legal" && role.can_fill_legal_position !== true) return false;

      return true;
    });

    let inserted = 0;

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
      .from("document_intake_sessions")
      .update({
        document_id: primaryDocument.id,
        ai_summary: aiResult.summary ?? null,
        ai_risk_level: aiResult.risk_level ?? null,
        ai_recommended_action: aiResult.recommended_action ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return json({
      success: true,
      session_id,
      document_id: primaryDocument.id,
      document_ids: readyDocuments.map((item) => item.document.id),
      filled_fields: inserted,
      total_candidate_fields: fields.length,
      summary: aiResult.summary ?? null,
      answers: allowedAnswers,
    });
  } catch (error) {
    console.error("document-intake-ai-fill error:", error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

function extractFields(schemaJson: any) {
  const steps = Array.isArray(schemaJson?.steps) ? schemaJson.steps : [];

  return steps
    .flatMap((step: any) => {
      const fields = Array.isArray(step.fields) ? step.fields : [];

      return fields.map((field: any) => ({
        field_name: field.key ?? field.name,
        field_label: field.label ?? field.key ?? field.name,
        type: field.type ?? "text",
        required: Boolean(field.required),
        options: field.options ?? null,
        help: field.help ?? null,
      }));
    })
    .filter((field: any) => field.field_name);
}

async function extractAnswersWithGemini({
  apiKey,
  documentText,
  caseIntelligenceMatrix,
  fields,
  templateCode,
}: {
  apiKey: string;
  documentText: string;
  caseIntelligenceMatrix: any | null;
  fields: any[];
  templateCode: string;
}) {
  const prompt = `
Ты юридический AI-ассистент. Нужно заполнить поля опросника конструктора документов на основании текста загруженного документа.

ВАЖНО:

1. Не придумывай факты.
2. Заполняй только поля, которые прямо подтверждены текстом документа.
3. Если данных нет — НЕ возвращай поле.
4. Не возвращай отрицательные значения типа false только потому, что условия нет в документе.
5. source_quote обязателен для каждого поля.
6. Сначала определи роль документа для выбранного template_code.
7. Документ может быть полезен частично: например доверенность подтверждает полномочия, FATCA/CRS подтверждает налоговое резидентство, паспорт подтверждает личность.
8. Не используй документ для выводов, которые он не может доказывать.
9. Для каждого поля заполняй только те данные, которые разрешены ролью документа.
10. Доверенность, паспорт, выписка, банковская форма или иной вспомогательный документ могут использоваться только для идентификационных/представительских данных, если они не подтверждают предметные факты спора.
11. Не используй слова "Компания", "Компании", "Общество", "Сторона", "Участник", "Основатель" как название компании.
12. company_name возвращай только если найдено конкретное официальное название: например HOOPE LTD, ООО "...", Cyprus Ltd и т.п.
13. company_type возвращай только если тип прямо указан: LTD, LLC, ООО, АО, Inc, GmbH и т.п. Не возвращай company_type = "other".
14. Если Non-compete не найден — не возвращай поле non_compete.
15. Не путай total_shares и voting_shares.
16. Если передан комплект документов, анализируй его как единое целое, устраняй противоречия и не выбирай значение произвольно.
17. Для каждого ответа верни source_document_id из заголовка того документа, где находится source_quote.

Правило для корпоративной структуры:
Если документ содержит:
- total shares = 100
- Founder Restricted Shares = 60
- Transferable Shares = 40

то:
- total_shares = 100
- voting_shares = 60
- non_transferable_shares = 60
- transferable_shares = 40

Нельзя автоматически считать, что все 100 акций являются голосующими.

template_code: ${templateCode}

CASE INTELLIGENCE MATRIX:
${JSON.stringify(caseIntelligenceMatrix ?? null, null, 2).slice(0, 20000)}

Правила заполнения карточки:
1. Карточку заполняй только фактическими значениями из оригинального OCR или Case Intelligence.
2. Никогда не записывай в поля значения вида [COMPANY_1], [PERSON_1], [BANK_DETAILS_1], [ADDRESS_1].
3. Если в тексте есть только placeholder — поле не возвращай.
4. Если Case Intelligence показывает противоречие по полю, заполняй только при высокой уверенности и ставь confidence не выше 0.75.
5. Если есть разные ИНН/адреса/подписанты/суммы — не выбирай произвольно, возвращай поле только если понятно, какое значение относится к нужной стороне.
6. Поля позиции ФНС/истца/ответчика/клиента заполняй из party_positions и position_verifications, а не из общих пересказов.
7. Если позиция стороны опровергается документами — не записывай её как установленный факт.

Поля опросника:
${JSON.stringify(fields, null, 2)}

Текст документа:
${documentText.slice(0, 120000)}

Верни строго JSON:
{
  "summary": "краткое содержание документа",
    "document_role": {
    "role": "core_evidence | supporting_evidence | identity_document | authority_document | context_document | irrelevant",
    "relevance_level": "none | low | medium | high",
    "can_fill_identity": true,
    "can_fill_authority": false,
    "can_fill_facts": false,
    "can_fill_legal_position": false,
    "can_change_legal_position": false,
    "allowed_use": ["identity"],
    "forbidden_use": ["legal_position"],
    "reason": "почему документ можно или нельзя использовать для выбранного шаблона"
  },
  "risk_level": "low | medium | high",
  "recommended_action": "что сделать юристу",
  "detected_entities": {},
  "detected_risks": [],
  "answers": [
    {
      "field_name": "string",
      "field_label": "string",
      "value": "любое JSON-значение",
      "confidence": 0.0,
      "source_document_id": "uuid из заголовка документа",
      "source_quote": "цитата",
      "source_page": null
    }
  ]
}
`;

  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];

  let lastError = "";

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      lastError = errorText;

      const retryable =
        response.status === 503 ||
        response.status === 429 ||
        errorText.includes("UNAVAILABLE") ||
        errorText.includes("RESOURCE_EXHAUSTED") ||
        errorText.includes("high demand");

      if (retryable) {
        continue;
      }

      throw new Error(errorText);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      lastError = `Gemini model ${model} returned empty response`;
      continue;
    }

    return JSON.parse(text);
  }

  throw new Error(lastError || "All Gemini models failed");
}
function sanitizeAnswers(rawAnswers: any[]) {
  const forbiddenCompanyNames = [
    "Компания",
    "Компании",
    "Общество",
    "Сторона",
    "Участник",
    "Основатель",
  ];
  const placeholderRe =
    /\[(COMPANY|PERSON|BANK_DETAILS|PASSPORT|ADDRESS|DATE|DOCUMENT_NUMBER)_\d+\]/i;
  const answers = rawAnswers
    .filter((answer) => {
      if (!answer?.field_name) return false;

      if (placeholderRe.test(String(answer.value ?? ""))) return false;
      if (placeholderRe.test(String(answer.source_quote ?? ""))) return false;

      if (
        answer.field_name === "company_name" &&
        forbiddenCompanyNames.includes(String(answer.value).trim())
      ) {
        return false;
      }

      if (answer.field_name === "company_type") {
        const value = String(answer.value).trim().toLowerCase();
        const quote = String(answer.source_quote ?? "")
          .trim()
          .toLowerCase();

        if (
          value === "other" ||
          value === "cyprus_ltd" ||
          quote.includes("governing law") ||
          quote.includes("cyprus law")
        ) {
          return false;
        }
      }

      if (answer.field_name === "non_compete" && answer.value === false) {
        return false;
      }

      if (["taxpayer_inn", "counterparty_inn"].includes(answer.field_name)) {
        const digits = String(answer.value ?? "").replace(/\D/g, "");
        if (digits.length !== 10 && digits.length !== 12) return false;
      }

      if (answer.field_name === "ogrn") {
        const digits = String(answer.value ?? "").replace(/\D/g, "");
        if (digits.length !== 13) return false;
      }

      if (answer.field_name === "ogrnip") {
        const digits = String(answer.value ?? "").replace(/\D/g, "");
        if (digits.length !== 15) return false;
      }

      if (!answer.source_quote || String(answer.source_quote).trim().length < 3) {
        return false;
      }

      return true;
    })
    .map((answer) => ({ ...answer }));

  const nonTransferable = answers.find((a) => a.field_name === "non_transferable_shares");

  const voting = answers.find((a) => a.field_name === "voting_shares");

  if (voting && Number(voting.value) === 100 && nonTransferable?.value) {
    voting.value = nonTransferable.value;
    voting.confidence = Math.min(Number(voting.confidence ?? 0.7), 0.8);
    voting.source_quote = nonTransferable.source_quote;
  }

  return answers;
}
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
