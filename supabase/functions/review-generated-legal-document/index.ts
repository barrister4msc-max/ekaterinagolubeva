import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  resolveReviewProfile,
  renderReviewProfileBlock,
} from "./review-profiles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();

    const {
      document_id,
      generated_document_id,
      run_type = "review",
      revision_materials = [],
      parent_document_id = null,
    } = payload;

    const targetDocumentId = generated_document_id || document_id;

    if (!targetDocumentId) {
      return json({ error: "document_id or generated_document_id is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) throw new Error("GEMINI_API_KEY is missing");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: doc, error: docError } = await supabase
      .from("generated_legal_documents")
      .select("*")
      .eq("id", targetDocumentId)
      .single();

    if (docError || !doc) return json({ error: "Generated document not found" }, 404);

        const matterId = doc.metadata?.matter_id;
    const intakeSessionId = doc.intake_session_id || doc.metadata?.intake_session_id || null;

        let matter = null;
    let strategy = null;
    let matterDocs: any[] = [];
    let intakeSession = null;
    let intakeAnswers: any[] = [];
    let intakeSourceDocument = null;

    if (matterId) {
      const { data: matterData } = await supabase
        .from("legal_matters")
        .select("*")
        .eq("id", matterId)
        .single();

      matter = matterData;

      const { data: strategyData } = await supabase
        .from("lawyer_matter_strategy")
        .select("*")
        .eq("matter_id", matterId)
        .single();

      strategy = strategyData;

      const { data: docsData } = await supabase
        .from("documents")
        .select("id,title,file_name,document_type,document_category,ai_summary,risk_level,metadata,ai_detected_entities,ai_detected_risks,legal_basis,missing_documents")
        .eq("matter_id", matterId)
        .eq("is_archived", false)
        .limit(30);

      matterDocs = docsData || [];
    }
    if (intakeSessionId) {
  const { data: sessionData } = await supabase
    .from("document_intake_sessions")
    .select("*")
    .eq("id", intakeSessionId)
    .single();

  intakeSession = sessionData;

  const { data: answersData } = await supabase
    .from("document_intake_answers")
    .select("*")
    .eq("session_id", intakeSessionId);

  intakeAnswers = answersData || [];

  if (intakeSession?.document_id) {
    const { data: sourceDocumentData } = await supabase
      .from("documents")
      .select("*")
      .eq("id", intakeSession.document_id)
      .single();

    intakeSourceDocument = sourceDocumentData;
  }
}

const resolveRevisionMaterials = async () => {
  if (!Array.isArray(revision_materials) || revision_materials.length === 0) {
    return [];
  }

  const resolved = [];

  for (const material of revision_materials) {
    const documentId = material?.document_id;
    const fileName = material?.file_name || material?.name || null;

    let documentRow = null;

    if (documentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      const { data } = await supabase
        .from("documents")
        .select("id,file_name,storage_path,mime_type,ocr_text,metadata,created_at")
        .eq("id", documentId)
        .maybeSingle();

      documentRow = data;
    }

    if (!documentRow && fileName) {
  const { data } = await supabase
    .from("documents")
    .select("id,file_name,storage_path,mime_type,ocr_text,metadata,created_at")
    .eq("file_name", fileName)
    .order("created_at", { ascending: false })
    .limit(1);

  if (data?.length) {
    documentRow = data[0];
    }
   }
    console.log(
  "[revision_material_resolved]",
  JSON.stringify({
    requested_file: fileName,
    found_document_id: documentRow?.id,
    found_text_length: documentRow?.ocr_text?.length ?? 0,
    extraction_status:
      documentRow?.metadata?.extraction_status ?? null,
  }),
);
    resolved.push({
      document_id: documentRow?.id ?? documentId ?? "unknown",
      file_name: documentRow?.file_name ?? fileName ?? "unknown",
      storage_path: documentRow?.storage_path ?? material?.storage_path ?? null,
      mime_type: documentRow?.mime_type ?? material?.mime_type ?? material?.type ?? null,
      ocr_text_length: documentRow?.ocr_text?.length ?? material?.ocr_text_length ?? 0,
      ocr_text: documentRow?.ocr_text ?? material?.ocr_text ?? null,
      metadata: documentRow?.metadata ?? material?.metadata ?? null,
      
    });
  }

  return resolved;
};

if (run_type === "revision_analysis") {
    const resolvedRevisionMaterials = await resolveRevisionMaterials();
    const {
  revision_analysis,
  review,
  ai_review,
  ...safeDocumentMetadata
} = doc.metadata || {};

const currentMaterialFileNames = new Set(
  resolvedRevisionMaterials
    .map((material: any) => material.file_name)
    .filter(Boolean),
);
  const revisionPrompt = `
Ты AI Legal Revision Analyst в системе KATI LAWYER.
КРИТИЧЕСКОЕ ЯЗЫКОВОЕ ПРАВИЛО:
Весь ответ верни строго на русском языке.
Запрещено использовать английский язык в summary, warnings, facts, risks, recommendations, legal_reasoning_report, missing_evidence, required_fixes, revision_summary, legal_reassessment, evidence_roles.reason.
Названия файлов можно оставлять как есть.
ТВОЯ ЗАДАЧА:
Проанализировать, изменяют ли новые материалы юридическую позицию по уже сформированному документу.

ВАЖНО:
1. Не переписывай документ.
2. Не придумывай факты.
3. Не придумывай нормы права.
4. Не придумывай судебную практику.
5. Если источник или цитата отсутствуют — укажи warning.
6. Все выводы являются предварительными и требуют проверки юриста.
7. Старая версия документа не изменяется. Анализ нужен только для решения юриста: оставить текущую версию или создать новую.
8. Для каждого нового материала сначала определи его доказательственную роль:
   core_evidence | supporting_evidence | identity_document | authority_document | context_document | irrelevant.
9. Документ может быть полезен частично. Не отбрасывай его полностью, если он подтверждает отдельные сведения.
10. Используй документ только для тех выводов, которые он реально может подтверждать.
11. Документы личности, доверенности, банковские формы, FATCA/CRS, выписки и справки могут подтверждать идентификацию, полномочия, резидентство, реквизиты или контекст, но сами по себе не должны менять правовую позицию по существу спора, если не подтверждают предметные факты.
12. Правовая позиция может измениться только если новые материалы являются core_evidence или прямо подтверждают/опровергают ключевые факты, на которых основан текущий документ.
13. Для каждого вывода указывай источник и роль документа.
14. После анализа доказательственной роли документов обязательно сформируй legal_reasoning_report.
15. AI не имеет права писать только "применяется статья X".
16. По каждому правовому выводу укажи:
    - какие факты к нему привели;
    - из каких документов они получены;
    - цитаты/страницы/источники;
    - почему выбрана именно эта норма;
    - какие нормы были отвергнуты;
    - почему они не подходят;
    - судебную практику за и против;
    - позицию оппонента;
    - контраргументы;
    - риски;
    - рекомендации юристу.
17. Если фактов, документов, норм или практики недостаточно — прямо укажи это в missing_evidence и lawyer_action_checklist. Не придумывай источники.
18. Любой факт, который AI использует в evidence_roles.reason, revision_summary, legal_reassessment, risks, main_strategy или lawyer_action_checklist, обязан быть внесён в legal_reasoning_report.facts[].
19. Если facts[] пустой, AI не имеет права делать содержательные выводы о документе. В этом случае укажи в missing_evidence, какие документы или факты отсутствуют.
20. Каждый факт в facts[] должен иметь source_document_id, source_file_name, source_quote и confidence.
21. Каждый факт из facts[] должен быть связан с evidence_map[].
22. Если документ имеет роль context_document, identity_document, authority_document или supporting_evidence, всё равно извлеки допустимые факты, но не используй их для изменения правовой позиции, если can_change_legal_position = false.
23. Не переноси факт в применимые нормы, если этот факт подтверждает только личность, полномочия, резидентство, адрес, реквизиты или общий контекст.
ТЕКУЩИЙ ДОКУМЕНТ:
${JSON.stringify({
  id: doc.id,
  title: doc.title,
  category: doc.category,
  status: doc.status,
  version_number: doc.version_number,
  content: doc.content,
  metadata: safeDocumentMetadata,
}).slice(0, 25000)}

НОВЫЕ МАТЕРИАЛЫ ДЛЯ ПЕРЕСМОТРА:
${JSON.stringify(resolvedRevisionMaterials || []).slice(0, 25000)}

ДЕЛО:
${JSON.stringify(matter || {}).slice(0, 8000)}

СТРАТЕГИЯ ДЕЛА:
${JSON.stringify(strategy || {}).slice(0, 15000)}

ДОКУМЕНТЫ ДЕЛА:
${JSON.stringify(matterDocs || []).slice(0, 15000)}

INTAKE SESSION:
${JSON.stringify(intakeSession || {}).slice(0, 8000)}

INTAKE ANSWERS:
${JSON.stringify(intakeAnswers || []).slice(0, 15000)}

Верни строго JSON без markdown:

{
  "success": true,
  "run_type": "revision_analysis",
  "generated_document_id": "",
  "parent_document_id": "",
    "evidence_roles": [
    {
      "document_id": "",
      "file_name": "",
      "role": "core_evidence | supporting_evidence | identity_document | authority_document | context_document | irrelevant",
      "relevance_level": "none | low | medium | high",
      "can_fill_identity": true,
      "can_fill_authority": false,
      "can_fill_facts": false,
      "can_fill_legal_position": false,
      "can_change_legal_position": false,
      "allowed_use": [],
      "forbidden_use": [],
      "reason": ""
    }
  ],
    "legal_reasoning_report": {
    "facts": [
      {
        "fact": "",
        "source_document_id": "",
        "source_file_name": "",
        "source_quote": "",
        "source_page": null,
        "confidence": 0
      }
    ],
    "evidence_map": [
      {
        "fact": "",
        "documents": [],
        "evidence_strength": "weak | medium | strong",
        "gaps": []
      }
    ],
    "applicable_laws": [
      {
        "law": "",
        "why_applies": "",
        "linked_facts": [],
        "required_evidence": [],
        "missing_evidence": []
      }
    ],
    "rejected_laws": [
      {
        "law": "",
        "why_rejected": "",
        "when_may_apply": ""
      }
    ],
    "case_law_supporting": [],
    "case_law_opposing": [],
    "opponent_position": [],
    "counter_arguments": [],
    "risks": [],
    "main_strategy": "",
    "alternative_strategies": [],
    "lawyer_action_checklist": []
  },
  "revision_summary": {
    "overall_change_level": "none | low | medium | high | critical",
    "does_legal_position_change": false,
    "short_summary": "",
    "recommended_action": "keep_current_version | create_new_version | request_more_documents"
  },
  "new_facts": [
    {
      "fact": "",
      "source": "",
      "quote": "",
      "confidence": 0,
      "verification_status": "ai_extracted | unverified"
    }
  ],
  "changed_facts": [
    {
      "previous_fact": "",
      "new_fact": "",
      "source": "",
      "quote": "",
      "impact": "low | medium | high"
    }
  ],
  "contradictions": [
    {
      "old_statement": "",
      "new_evidence": "",
      "source": "",
      "severity": "low | medium | high"
    }
  ],
  "missing_evidence": [
    {
      "missing_item": "",
      "why_needed": "",
      "priority": "low | medium | high"
    }
  ],
  "legal_reassessment": {
    "previous_law_assumptions": [],
    "still_applicable_laws": [],
    "new_possible_laws": [],
    "alternative_legal_approaches": [],
    "why_position_changes_or_not": ""
  },
  "court_practice": {
    "supporting": [],
    "opposing": [],
    "conflicting": []
  },
  "risk_change": {
    "previous_risk_level": "unknown | low | medium | high",
    "new_risk_level": "low | medium | high | critical",
    "reason": "",
    "risk_factors": []
  },
  "opponent_arguments": [
    {
      "argument": "",
      "strength": "low | medium | high",
      "response_strategy": ""
    }
  ],
  "lawyer_decision_options": [
    {
      "option": "keep_current_version",
      "label": "Оставить текущую версию актуальной",
      "reason": ""
    },
    {
      "option": "create_new_version",
      "label": "Создать новую версию",
      "reason": ""
    },
    {
      "option": "request_more_documents",
      "label": "Запросить дополнительные документы",
      "reason": ""
    }
  ],
  "warnings": [],
  "needs_lawyer_review": true
}
`;
  console.log("[revision_analysis] before gemini", {
  targetDocumentId,
  intakeSessionId,
  materials_count: resolvedRevisionMaterials.length,
  materials: resolvedRevisionMaterials.map((m: any) => ({
    document_id: m.document_id,
    file_name: m.file_name,
    ocr_text_length: m.ocr_text_length,
    has_ocr_text: Boolean(m.ocr_text),
  })),
});  
  const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const callGeminiWithRetry = async () => {
  let lastErrorText = "";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: revisionPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (response.ok) {
        console.log("[revision_analysis] Gemini success", {
          model,
          attempt,
        });

        return {
          response,
          model,
        };
      }

      lastErrorText = await response.text();

      console.error("[revision_analysis] Gemini failed", {
        model,
        attempt,
        status: response.status,
        body: lastErrorText.slice(0, 1000),
      });

      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(
          `Gemini error ${response.status}: ${lastErrorText.slice(0, 1000)}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }

  throw new Error(
    `Gemini временно недоступен после повторных попыток: ${lastErrorText.slice(0, 1000)}`,
  );
};

const { response: geminiResponse, model: usedModel } =
  await callGeminiWithRetry();

  const geminiJson = await geminiResponse.json();
const raw = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

console.log("[revision_analysis] gemini raw", raw.slice(0, 1000));

let revision: any;

try {
  revision = JSON.parse(raw);
} catch (parseError) {
  console.error("[revision_analysis] JSON parse error", {
    error: parseError,
    raw: raw.slice(0, 3000),
  });

  throw new Error(
    `Gemini вернул невалидный JSON: ${raw.slice(0, 1000)}`,
  );
}
revision.model = usedModel;
if (Array.isArray(revision.evidence_roles)) {
  revision.evidence_roles = revision.evidence_roles.filter((role: any) =>
    currentMaterialFileNames.has(role?.file_name),
  );
}
  if (Array.isArray(revision.evidence_roles)) {
  const grouped = new Map<string, any>();

  for (const role of revision.evidence_roles) {
    const fileName = role?.file_name || "unknown";

    const currentHasRealDocumentId =
      typeof role?.document_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        role.document_id,
      );

    const existing = grouped.get(fileName);

    if (!existing) {
      grouped.set(fileName, role);
      continue;
    }

    const existingHasRealDocumentId =
      typeof existing?.document_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        existing.document_id,
      );

    if (!existingHasRealDocumentId && currentHasRealDocumentId) {
      grouped.set(fileName, role);
      continue;
    }

    if (
      existingHasRealDocumentId === currentHasRealDocumentId &&
      existing?.role === "irrelevant" &&
      role?.role !== "irrelevant"
    ) {
      grouped.set(fileName, role);
    }
  }

  revision.evidence_roles = Array.from(grouped.values());
}  
  const revisionResult = {
    ...revision,
    success: true,
    run_type: "revision_analysis",
    generated_document_id: targetDocumentId,
    parent_document_id: parent_document_id || doc.parent_document_id || null,
    reviewed_at: new Date().toISOString(),
    reviewer: "review-generated-legal-document",
    model: "gemini-2.5-flash-lite",
    needs_lawyer_review: true,
  };

  const updatedMetadata = {
    ...(doc.metadata || {}),
    revision_analysis: revisionResult,
  };

  const { data: updated, error: updateError } = await supabase
    .from("generated_legal_documents")
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetDocumentId)
    .select("id,title,status,metadata")
    .single();

  if (updateError) throw updateError;

  if (intakeSessionId) {
    await supabase.from("document_intake_ai_runs").insert({
      session_id: intakeSessionId,
      generated_document_id: targetDocumentId,
      run_type: "revision_analysis",
      status: "completed",
      input_snapshot: {
        generated_document: {
          id: doc.id,
          title: doc.title,
          category: doc.category,
          status: doc.status,
          version_number: doc.version_number,
          intake_session_id: intakeSessionId,
        },
        revision_materials: resolvedRevisionMaterials,
        intake_session: intakeSession,
        intake_answers: intakeAnswers,
        matter,
        strategy,
        matter_documents: matterDocs,
        intake_source_document: intakeSourceDocument,
      },
      ai_result: revisionResult,
      source_verification_status: "needs_lawyer_review",
      hallucination_risk:
        revisionResult?.risk_change?.new_risk_level === "critical" ||
        revisionResult?.risk_change?.new_risk_level === "high"
          ? "high"
          : revisionResult?.revision_summary?.overall_change_level === "medium"
            ? "medium"
            : "low",
      legal_accuracy_score: null,
      needs_lawyer_review: true,
      review_status: "revision_analysis",
      review_result: revisionResult,
      problems: revisionResult.contradictions ?? [],
      required_fixes: revisionResult.missing_evidence ?? [],
      recommendations: revisionResult.lawyer_decision_options ?? [],
      model_name: "gemini-2.5-flash-lite",
      completed_at: new Date().toISOString(),
    });

    await supabase
      .from("document_intake_sessions")
      .update({
        last_ai_analysis_at: new Date().toISOString(),
        analysis_iteration: (intakeSession?.analysis_iteration ?? 0) + 1,
        generated_document_id: targetDocumentId,
      })
      .eq("id", intakeSessionId);
  }

  return json({
    success: true,
    document_id: targetDocumentId,
    run_type: "revision_analysis",
    revision_analysis: revisionResult,
    updated_document: updated,
  });
}
    const reviewProfile = resolveReviewProfile(doc);
    const reviewProfileBlock = reviewProfile ? renderReviewProfileBlock(reviewProfile) : "";
    const prompt = `
Ты AI Legal Quality Reviewer. Проверяешь юридический документ перед тем, как юрист увидит его как черновик.

ТВОЯ ЗАДАЧА:
Проверить документ на юридическое качество, достоверность, соответствие фактам дела, стратегии и ограничениям.

ВАЖНО:
1. Не переписывай документ.
2. Не добавляй новые факты.
3. Не придумывай нормы права, судебные дела, письма ФНС/Минфина, даты и номера.
4. Проверяй только по данным ниже.
5. Если данных недостаточно — укажи это как риск.
6. Неподтвержденные источники не считать допустимым правовым основанием.
7. Методология юриста не является источником права.
8. Для предварительного запроса документов допустимо отсутствие правовых норм, если документ только запрашивает сведения.
9. Проверяй, что каждый юридический вывод основан на допустимой роли источника.
10. Документ с ролью identity_document не может сам по себе подтверждать правовую позицию по спору.
11. Документ с ролью authority_document подтверждает полномочия, но не доказывает предмет спора.
12. Документ с ролью supporting_evidence может подтверждать отдельные вспомогательные факты, но не должен быть единственным основанием ключевого правового вывода.
13. Ключевой правовой вывод должен опираться на core_evidence либо на совокупность проверенных источников.
ДОКУМЕНТ:
${JSON.stringify({
  id: doc.id,
  title: doc.title,
  category: doc.category,
  status: doc.status,
  content: doc.content,
  metadata: doc.metadata,
}).slice(0, 25000)}

ДЕЛО:
${JSON.stringify(matter || {}).slice(0, 8000)}

СТРАТЕГИЯ ДЕЛА:
${JSON.stringify(strategy || {}).slice(0, 25000)}

ДОКУМЕНТЫ ДЕЛА:
${JSON.stringify(matterDocs || []).slice(0, 25000)}

INTAKE SESSION:
${JSON.stringify(intakeSession || {}).slice(0, 8000)}

INTAKE ANSWERS:
${JSON.stringify(intakeAnswers || []).slice(0, 25000)}

INTAKE SOURCE DOCUMENT:
${JSON.stringify(intakeSourceDocument || {}).slice(0, 25000)}
Проверь:

1. false_facts:
Есть ли в тексте утверждения о фактах, которых нет в деле.

2. unsupported_legal_basis:
Есть ли ссылки на нормы/практику без подтвержденного источника.

3. hallucinations:
Есть ли вымышленные статьи, письма, суды, номера дел, даты.

4. strategy_alignment:
Соответствует ли документ выбранной стратегии.

5. completeness:
Достаточен ли документ для своего типа.

6. client_safety:
Можно ли показывать юристу как рабочий черновик.

${reviewProfileBlock}
Верни строго JSON без markdown:

{
  "overall_score": 0,
  "ready_for_lawyer": true,
  "ready_for_client": false,
  "review_status": "passed | needs_revision | blocked",
  "summary": "",
    "evidence_role_review": {
    "has_role_mismatch": false,
    "role_mismatch_summary": "",
    "unsupported_by_core_evidence": [],
    "sources_used_incorrectly": []
  },
  "strengths": [],
  "problems": [
    {
      "type": "false_fact | unsupported_legal_basis | hallucination | strategy_conflict | missing_information | style_issue | other",
      "severity": "low | medium | high | critical",
      "text_fragment": "",
      "problem": "",
      "recommendation": ""
    }
  ],
  "required_fixes": [],
  "recommendations": [],
  "detected_unsupported_claims": [],
  "detected_safe_sections": [],
  "can_be_sent_as_preliminary": true,
  "can_be_sent_as_final": false
}
`;
const GEMINI_REVIEW_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

const modelAttempts: Array<{
  model: string;
  status: "ok" | "http_error" | "exception";
  http_status?: number;
  error?: string;
}> = [];

let geminiResponse: Response | null = null;
let finalModel = GEMINI_REVIEW_MODELS[0];

for (const model of GEMINI_REVIEW_MODELS) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (response.ok) {
      modelAttempts.push({
        model,
        status: "ok",
        http_status: response.status,
      });

      geminiResponse = response;
      finalModel = model;
      break;
    }

    const errorText = await response.text();

    modelAttempts.push({
      model,
      status: "http_error",
      http_status: response.status,
      error: errorText,
    });

    if (![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Gemini fatal error (${model}): ${errorText}`);
    }
  } catch (error) {
    modelAttempts.push({
      model,
      status: "exception",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (!geminiResponse) {
  const lastError = modelAttempts[modelAttempts.length - 1]?.error ?? "Unknown Gemini error";

  throw new Error(
    `all_models_failed: ${lastError}\n\nAttempts: ${JSON.stringify(modelAttempts)}`,
  );
}

    const geminiJson = await geminiResponse.json();
    const raw = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const review = JSON.parse(raw);

    const updatedMetadata = {
      ...(doc.metadata || {}),
      review: {
  ...review,
  reviewed_at: new Date().toISOString(),
  reviewer: "review-generated-legal-document",
  model: finalModel,
  diagnostics: {
    final_model: finalModel,
    fallback_used: finalModel !== "gemini-2.5-flash-lite",
    model_attempts: modelAttempts,
  },
},
    };

    const { data: updated, error: updateError } = await supabase
      .from("generated_legal_documents")
            .update({
        metadata: updatedMetadata,
        ai_review_status: review.review_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetDocumentId)
      .select("id,title,status,metadata")
      .single();

    if (updateError) throw updateError;
        if (intakeSessionId) {
      await supabase.from("document_intake_ai_runs").insert({
        session_id: intakeSessionId,
        generated_document_id: targetDocumentId,
        run_type: "review",
        status: "completed",
        input_snapshot: {
          generated_document: {
            id: doc.id,
            title: doc.title,
            category: doc.category,
            status: doc.status,
            intake_session_id: intakeSessionId,
          },
          intake_session: intakeSession,
          intake_answers: intakeAnswers,
          matter,
          strategy,
          matter_documents: matterDocs,
          intake_source_document: intakeSourceDocument,
        },
        ai_result: {
  ...review,
  diagnostics: {
    final_model: finalModel,
    fallback_used: finalModel !== "gemini-2.5-flash-lite",
    model_attempts: modelAttempts,
  },
},
        source_verification_status:
          review.review_status === "passed" ? "verified" : "needs_review",
        hallucination_risk:
          review.review_status === "blocked"
            ? "high"
            : review.review_status === "needs_revision"
              ? "medium"
              : "low",
        legal_accuracy_score: review.overall_score ?? null,
        needs_lawyer_review: true,
        review_status: review.review_status,
        review_result: review,
        problems: review.problems ?? [],
        required_fixes: review.required_fixes ?? [],
        recommendations: review.recommendations ?? [],
        model_name: finalModel,
        completed_at: new Date().toISOString(),
      });

      await supabase
        .from("document_intake_sessions")
        .update({
          status:
            review.review_status === "passed"
              ? "ai_reviewed"
              : review.review_status === "blocked"
                ? "needs_revision"
                : "lawyer_review",
          last_ai_analysis_at: new Date().toISOString(),
          analysis_iteration: (intakeSession?.analysis_iteration ?? 0) + 1,
          generated_document_id: targetDocumentId,
        })
        .eq("id", intakeSessionId);
    }
    if (matterId) {
      await supabase.from("lawyer_document_actions").insert({
        matter_id: matterId,
        action_type: "document_reviewed",
        title: `AI-проверка документа: ${doc.title}`,
        description: `Оценка: ${review.overall_score}/100. Статус: ${review.review_status}`,
        priority:
          review.review_status === "blocked"
            ? "urgent"
            : review.review_status === "needs_revision"
              ? "high"
              : "medium",
        status: review.review_status === "passed" ? "completed" : "suggested",
        metadata: {
          source: "review-generated-legal-document",
          generated_document_id: targetDocumentId,
          review_status: review.review_status,
          overall_score: review.overall_score,
          ready_for_client: review.ready_for_client,
          reviewed_at: new Date().toISOString(),
        },
      });
    }

    return json({
  success: true,
  document_id: targetDocumentId,
  run_type: "review",
  review,
  updated_document: updated,
});
    } catch (error) {
    console.error(error);

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    try {
      if (targetDocumentId) {
        await supabase.from("document_intake_ai_runs").insert({
          session_id: intakeSessionId ?? null,
          generated_document_id: targetDocumentId,
          run_type: "review",
          status: "failed",
          error_message: errorMessage,
          input_snapshot: {
            generated_document_id: targetDocumentId,
            intake_session_id: intakeSessionId ?? null,
            source: "review-generated-legal-document",
          },
          ai_result: {
            error: errorMessage.startsWith("all_models_failed")
              ? "all_models_failed"
              : "review_failed",
            message: errorMessage,
            failed_at: new Date().toISOString(),
          },
          needs_lawyer_review: true,
          review_status: "failed",
          completed_at: new Date().toISOString(),
        });
      }
    } catch (logError) {
      console.error("Failed to save failed review run", logError);
    }

    return json(
      {
        success: false,
        error: errorMessage,
      },
      500,
    );
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
