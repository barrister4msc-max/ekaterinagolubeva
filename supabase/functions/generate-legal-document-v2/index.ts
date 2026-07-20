
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  getGenerationProfile,
  renderTemplateProfileBlock,
} from "./template-profiles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();

    const {
  template_code,
  template,
  jurisdiction,
  language = "ru",
  generation_mode = "standalone",
  intake = {},
  attachments = [],
  special_instructions = "",
  schema = {},
  session_id,
  intake_session_id,
  legal_analysis = null,
  legal_analysis_run_id = null,
  document_context = null,
  document_context_quality = null,
  document_context_summary = null,
  case_intelligence_generation_context = null,
  case_intelligence_facts = null,
  case_intelligence_issues = null,
  case_intelligence_evidence = null,
  case_intelligence_missing_evidence = null,
  } = payload;

const effectiveSessionId = intake_session_id || session_id || null;
const hasDocumentContext =
  document_context &&
  Number(document_context_quality ?? 0) >= 60;
  const legalAnalysisObject =
  legal_analysis && typeof legal_analysis === "object"
    ? (legal_analysis as Record<string, any>)
    : null;

const generationConclusions = Array.isArray(
  legalAnalysisObject?.generation_conclusions,
)
  ? legalAnalysisObject.generation_conclusions
  : Array.isArray(legalAnalysisObject?.conclusions)
    ? legalAnalysisObject.conclusions.filter(
        (c: any) =>
          c?.provenance?.use_in_generation !== false &&
          c?.provenance?.needs_source !== true,
      )
    : [];

const blockedConclusions = Array.isArray(
  legalAnalysisObject?.blocked_conclusions,
)
  ? legalAnalysisObject.blocked_conclusions
  : Array.isArray(legalAnalysisObject?.conclusions)
    ? legalAnalysisObject.conclusions.filter(
        (c: any) =>
          c?.provenance?.use_in_generation === false ||
          c?.provenance?.needs_source === true,
      )
    : [];

const legalAnalysisForGeneration = legalAnalysisObject
  ? {
      ...legalAnalysisObject,
      conclusions: generationConclusions,
      generation_conclusions: generationConclusions,
      blocked_conclusions: blockedConclusions,
      reasoning_engine: legalAnalysisObject.reasoning_engine ?? null,
    }
  : null;
    const workingStrategy =
     payload.working_strategy ??
     legalAnalysisObject?.working_strategy ??
    null;
    if (!template_code) return json({ success: false, error: "template_code is required" }, 400);
    const templateProfile = getGenerationProfile(template_code);
    const templateProfileBlock = templateProfile ? renderTemplateProfileBlock(templateProfile) : "";
    if (!template?.title) return json({ success: false, error: "template.title is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) throw new Error("GEMINI_API_KEY is missing");

    const supabase = createClient(supabaseUrl, serviceKey);

    const requiresLocalLawyerReview = ["CY", "Cyprus", "IL", "Israel", "GE", "Georgia"].includes(
      String(jurisdiction),
    );
    const documentContextBlock = hasDocumentContext
  ? `
==============================
DOCUMENT CONTEXT
==============================

Используй этот контекст как основной источник.

${JSON.stringify(document_context, null, 2)}

КАЧЕСТВО КОНТЕКСТА:
${document_context_quality}

СВОДКА:

${document_context_summary}

Если Document Context присутствует —
он имеет приоритет над самостоятельным анализом.
`
  : "";
    const prompt = `
 Ты профессиональный юридический помощник Екатерины Голубевой.

 ЗАДАЧА:
 Сформировать предварительный юридический документ по данным конструктора документов.

 ВАЖНО:
 1. Не придумывай факты.
 2. Не придумывай нормы права, судебную практику, письма госорганов, даты и номера.
 3. Если данных недостаточно — прямо укажи, что документ предварительный.
 4. Для Cyprus / Israel / Georgia обязательно укажи, что требуется проверка локальным юристом соответствующей юрисдикции.
 5. Не раскрывай использование AI.
 6. Пиши в профессиональном юридическом стиле.
 7. Если это международный корпоративный документ — обязательно предусмотри:
   - governing law;
   - dispute resolution;
   - corporate governance;
   - share transfer restrictions;
   - deadlock;
   - confidentiality;
   - IP ownership;
   - compliance / AML / sanctions review, если применимо.

ШАБЛОН:
${JSON.stringify(template, null, 2)}

ЮРИСДИКЦИЯ:
${jurisdiction}

ЯЗЫК:
${language}

РЕЖИМ ГЕНЕРАЦИИ:
${generation_mode}

INTAKE:
${JSON.stringify(intake, null, 2)}

ATTACHMENTS:
${JSON.stringify(attachments, null, 2)}

SCHEMA:
${JSON.stringify(schema, null, 2)}

SPECIAL INSTRUCTIONS:
${special_instructions}

LEGAL ANALYSIS:
${legalAnalysisForGeneration ? JSON.stringify(legalAnalysisForGeneration, null, 2) : "LEGAL_ANALYSIS_NOT_PROVIDED"}
REASONING ENGINE:

${legalAnalysisForGeneration?.reasoning_engine
  ? JSON.stringify(legalAnalysisForGeneration.reasoning_engine, null, 2)
  : "REASONING_ENGINE_NOT_PROVIDED"}
  WORKING STRATEGY:

${workingStrategy
  ? JSON.stringify(workingStrategy, null, 2)
  : "WORKING_STRATEGY_NOT_PROVIDED"}
CASE INTELLIGENCE:

Generation Context:
${case_intelligence_generation_context
  ? JSON.stringify(case_intelligence_generation_context, null, 2)
  : "NOT_PROVIDED"}

Facts:
${case_intelligence_facts
  ? JSON.stringify(case_intelligence_facts, null, 2)
  : "NOT_PROVIDED"}

Issues:
${case_intelligence_issues
  ? JSON.stringify(case_intelligence_issues, null, 2)
  : "NOT_PROVIDED"}

Evidence:
${case_intelligence_evidence
  ? JSON.stringify(case_intelligence_evidence, null, 2)
  : "NOT_PROVIDED"}

Missing Evidence:
${case_intelligence_missing_evidence
  ? JSON.stringify(case_intelligence_missing_evidence, null, 2)
  : "NOT_PROVIDED"}
${documentContextBlock}
ПРАВИЛА ИСПОЛЬЗОВАНИЯ LEGAL ANALYSIS:

1. Если LEGAL ANALYSIS передан, документ должен строиться на его основе.
2. Не меняй правовую квалификацию, основную позицию, применимые нормы, контраргументы и выводы, если они уже указаны в LEGAL ANALYSIS.
3. Если LEGAL ANALYSIS содержит fact_to_law_mapping, используй эту связку ФАКТ → НОРМА → ВЫВОД в content документа.
4. Если LEGAL ANALYSIS содержит missing_evidence, обязательно включи раздел о недостающих доказательствах.
5. Если LEGAL ANALYSIS содержит generation_instructions, следуй им при структуре и содержании документа.
6. Если LEGAL ANALYSIS содержит sources/source_actuality, используй их как источники и не придумывай новые ссылки.
7. Если LEGAL ANALYSIS отсутствует, проведи анализ самостоятельно по intake, attachments, schema и special_instructions.
7.1. Если LEGAL ANALYSIS содержит generation_conclusions, используй ТОЛЬКО их.
7.2. Запрещено использовать blocked_conclusions.
7.3. Запрещено использовать conclusions, где provenance.use_in_generation=false.
7.4. Запрещено использовать conclusions, где provenance.needs_source=true.
7.5. Если важный вывод находится только в blocked_conclusions — не включай его в документ, а добавь предупреждение в warnings.
7.6. Если REASONING ENGINE содержит selected_position — именно она является основной правовой позицией документа.

7.7. Используй supporting_arguments как основу мотивировочной части.

7.8. Используй recommendations при формировании просительной части и рекомендаций клиенту.

7.9. Никогда не используй blocked_arguments.
7.10. Если WORKING STRATEGY передана:

- она имеет приоритет над reasoning_engine.selected_position;

- если strategy_source == "lawyer_override",
используй исключительно стратегию, выбранную юристом;

- не изменяй выбор юриста;

- не возвращайся к первоначальной стратегии AI;

- первоначальную стратегию AI допускается упомянуть только как исходную рекомендацию;

- вся структура документа должна строиться вокруг WORKING STRATEGY.

7.11. Если WORKING STRATEGY отсутствует,
используй выбранную REASONING ENGINE стратегию.
7.12. Если LEGAL ANALYSIS содержит явные поля target_document / process_stage / template_code — они имеют строгий приоритет над любой противоречащей free-text инструкцией в recommendations или generation_instructions. Запрещено менять процессуальный тип целевого документа (например, превращать жалобу в возражения) на основании upstream free-text. Материалы предыдущих стадий (акт проверки, требование, решение, возражения) используются только как история/контекст.
8. Если находишь противоречие между LEGAL ANALYSIS и исходными документами, не меняй позицию молча — добавь предупреждение в warnings.
ПРАВИЛА ИСПОЛЬЗОВАНИЯ CASE INTELLIGENCE

1. Используй strongest_arguments как основу правовой позиции.
2. Не игнорируй weakest_arguments — либо усили их, либо прямо укажи недостатки.
3. Перед построением документа обязательно проверь missing_before_generation.
4. Не строй окончательные выводы, если отсутствуют критические доказательства.
5. Используй issues как структуру юридической аргументации.
6. Используй evidence_matrix для выбора доказательств.
7. Не формулируй выводы, которые противоречат contradictions.
8. Если generation_context присутствует — он имеет приоритет над самостоятельными выводами модели.
ПРАВИЛА DOCUMENT CONTEXT

Если передан DOCUMENT CONTEXT:

1. Используй его как главный источник фактов.
2. Не переопределяй legal position.
3. Используй fact_to_evidence_mapping.
4. Используй generation_instructions.
5. Используй supporting_sources.
6. Не придумывай отсутствующие доказательства.
7. Если есть противоречие —
добавь предупреждение в warnings.
ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЮРИДИЧЕСКОМУ АНАЛИЗУ

Если документ относится к:

- налоговым документам;
- правовым заключениям;
- судебным документам;
- исковым заявлениям;
- возражениям;
- отзывам;
- жалобам;
- процессуальным документам;
- правовым позициям;

то AI ОБЯЗАН включить непосредственно в content документа отдельный раздел:

=========================================
ПРАВОВОЕ ОБОСНОВАНИЕ И АРГУМЕНТАЦИЯ
=========================================

Данный раздел должен содержать:

1. Установленные фактические обстоятельства.

AI обязан перечислить только те факты, которые подтверждаются материалами дела, ответами конструктора, приложенными документами или RAG.

Не допускается придумывание фактов.

-----------------------------------------

2. Применимые нормы права.

Для каждой нормы необходимо указать:

- статью;
- кодекс или закон;
- почему именно эта норма применяется.

Недостаточно просто перечислить статьи.

-----------------------------------------

3. Связь "ФАКТ → НОРМА → ВЫВОД".

Для каждой применяемой нормы AI обязан показать:

Факт.

↓

Какая норма применяется.

↓

Почему именно данный факт делает норму применимой.

↓

Какое юридическое последствие возникает.

-----------------------------------------

4. Юридическая аргументация.

AI обязан объяснить:

- почему выбрана именно эта правовая позиция;
- какие юридические выводы следуют из применения каждой нормы;
- каким образом нормы взаимосвязаны между собой.

-----------------------------------------

5. Альтернативные правовые подходы.

Если существуют альтернативные нормы или способы защиты,

AI обязан:

- перечислить их;
- объяснить почему выбран основной вариант.

Если альтернатив нет —

прямо написать:

"Альтернативные правовые основания отсутствуют либо неприменимы."

-----------------------------------------

6. Судебная практика.

Если в RAG имеются судебные акты,

AI обязан:

- указать их значение;
- объяснить каким образом они подтверждают позицию.

Если судебной практики нет —

не придумывать её.

-----------------------------------------

7. Налоговые документы.

Для ВСЕХ налоговых документов данный раздел является ОБЯЗАТЕЛЬНЫМ.

Дополнительно необходимо анализировать:

- Налоговый кодекс РФ;
- письма ФНС;
- письма Минфина;
- судебную практику;
- позицию налогового органа;
- контраргументы налогоплательщика.

При этом письма ФНС и Минфина использовать только как административную практику.

Не использовать их как источник права.

-----------------------------------------

8. Использование базы знаний.

При наличии источников использовать:

- законодательство;
- судебную практику;
- практику Екатерины Голубевой;
- шаблоны;
- внутренние методические материалы;
- письма ФНС;
- письма Минфина.

-----------------------------------------

9. Запреты.

Запрещено:

- придумывать статьи;
- придумывать судебную практику;
- придумывать письма ФНС;
- придумывать письма Минфина;
- придумывать реквизиты документов;
- ссылаться на источник, которого нет в переданном контексте.

Если подтверждения нет —

писать:

"Источник требует проверки юристом."

-----------------------------------------

10. Качество документа.

Документ должен демонстрировать не только итоговую позицию,

но и полную юридическую логику её формирования.

Недостаточно написать вывод.

Необходимо показать ход юридического анализа.
PARAGRAPH PROVENANCE RULES

   The field paragraph_provenance is REQUIRED.

   For every meaningful section or paragraph of the generated document,
   return exactly one paragraph_provenance item.

   Do NOT return an empty array if the document contains legal analysis.

   Use ONLY identifiers that already exist in:

   - argument_map
   - generation_conclusions
   - facts_index
   - fact_to_law_mapping
   - evidence_matrix
   - trusted_sources
   - working_strategy
   - reasoning_engine

    Never invent ids.

   Never invent documents.

   Never invent legal sources.

   Never invent arguments.

   If a section is introductory and has no evidence,
   still return one provenance item with empty arrays.

   The number of paragraph_provenance objects should approximately match
   the number of meaningful sections of the generated document.

   text_preview must contain the beginning of the corresponding generated section.

   used_strategy_id must contain the strategy that actually produced this section.
   ==========================================================
${templateProfileBlock}
DOCUMENT GENERATION RULES
==========================================================

The final document MUST be generated from the legal analysis.

Do NOT generate only a summary.

Expand the legal reasoning into a complete legal document.

Use:

- generation_conclusions
- reasoning_engine
- argument_map
- evidence_matrix
- trusted_sources
- working_strategy

Every supported conclusion should become a substantive section of the document.

Every argument from argument_map that supports the selected strategy should be reflected in the legal reasoning.

For every argument:

Fact
↓

Evidence
↓

Legal rule
↓

Court practice (if available)
↓

Legal reasoning
↓

Conclusion

If several arguments support the same legal conclusion,
merge them into one coherent section.

Do NOT stop after an introductory section.

Produce a complete document appropriate for the selected template.

The generated document should normally contain multiple substantive sections,
not only an introduction.

Every legal conclusion used in the document must originate from
generation_conclusions or the selected reasoning strategy.

Do not ignore supporting arguments.

Do not compress the document into a short summary when sufficient analysis exists.
DOCUMENT COMPLETENESS RULES FOR ALL TEMPLATES

These rules apply to every template_code and every practice area:
tax, real_estate, contracts, court, corporate, bankruptcy, inheritance and civil disputes.

Never replace the full document with a placeholder such as:
"Документ находится на стадии формирования..."
"Для завершения подготовки необходимо предоставить..."
"Документ является предварительным проектом..."

If evidence is missing, still generate the full draft document.

Missing evidence must be included as a separate section inside the document:

"Недостающие доказательства"

Do not stop generation because of:
- missing_evidence
- missing_inputs
- lawyer_review_required
- requires_local_lawyer_review
- low evidence coverage
- needs_manual_check
- source localization missing

The document may be marked as preliminary, but it must still contain all substantive sections required by the selected template.

For every template, the content field must contain the full document text, not a status note.
SOURCE LOCALIZATION RULES

For every item in selected_laws, supporting_court_practice, supporting_fns_letters and supporting_minfin_letters, return precise localization when available:

- article
- point
- paragraph
- page
- quote
- why_used
- used_in
- official_url

Do not return only the general source title if a specific article, point or quote is available.

If exact localization is unknown, set:
"localization_missing": true
and explain in "why_used" what must be checked manually.
Верни строго JSON без markdown:
{
  "title": "",
  "document_type": "",
  "language": "",
  "is_preliminary": true,
  "requires_local_lawyer_review": false,
  "content": "",
  "legal_reasoning": {
    "status": "generated",
    "selected_laws": [
  {
    "title": "",
    "law": "",
    "article": "",
    "point": "",
    "paragraph": "",
    "page": "",
    "quote": "",
    "why_used": "",
    "used_in": [],
    "official_url": "",
    "localization_missing": false
  }
],
"why_selected": [],
"fact_to_law_mapping": [],
"alternative_laws_considered": [],
"why_alternatives_rejected": [],
"supporting_court_practice": [
  {
    "title": "",
    "case_number": "",
    "court": "",
    "date": "",
    "point": "",
    "paragraph": "",
    "page": "",
    "quote": "",
    "why_used": "",
    "used_in": [],
    "official_url": "",
    "localization_missing": false
  }
],
"supporting_fns_letters": [
  {
    "title": "",
    "number": "",
    "date": "",
    "point": "",
    "paragraph": "",
    "page": "",
    "quote": "",
    "why_used": "",
    "used_in": [],
    "official_url": "",
    "localization_missing": false
  }
],
"supporting_minfin_letters": [
  {
    "title": "",
    "number": "",
    "date": "",
    "point": "",
    "paragraph": "",
    "page": "",
    "quote": "",
    "why_used": "",
    "used_in": [],
    "official_url": "",
    "localization_missing": false
  }
],
    "missing_evidence": [],
    "lawyer_review_required": true
  },
  "missing_inputs": [],
  "warnings": [],
    "quality_notes": [],

  "paragraph_provenance": [
    {
      "paragraph_id": "p_1",
      "heading": "",
      "text_preview": "",
      "used_arguments": [
  {
    "id": "",
    "title": "",
    "reason": ""
  }
  ],
      "used_conclusions": [],
      "used_facts": [],
      "used_documents": [],
      "used_sources": [],
      "used_strategy_id": "",
      "evidence_strength": "high",
      "support_level": "strong"
    }
  ]
}
`;
  

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      throw new Error(`Gemini error: ${await geminiResponse.text()}`);
    }

    const geminiJson = await geminiResponse.json();
    const raw = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("RAW GEMINI:", raw);
    const generated = JSON.parse(raw);
    generated.paragraph_provenance ??= [];
    const title =
      generated.title ||
      `${template.title} — черновик`;

    const { data: inserted, error: insertError } = await supabase
      .from("generated_legal_documents")
      .insert({
        lead_id: null,
        crm_lead_id: null,
        template_id: null,
        template_key: `builder_${slugify(template_code)}_${Date.now()}`,
        category: template.category || template.practice_area || null,
        title,
        status: "draft",
        content: generated.content || "",
        created_by: null,
intake_session_id: effectiveSessionId,
metadata: {
          source: "generate-legal-document-v2",
          generation_mode,
          template_code,
          template,
          generation_profile: templateProfile?.generation_profile ?? "universal",
          document_type: templateProfile?.document_type ?? (generated?.document_type || null),
          review_profile: templateProfile?.review_profile ?? "universal",
          intake_session_id: effectiveSessionId,
          legal_analysis_run_id,
          legal_analysis: legalAnalysisForGeneration,
          generation_conclusions: generationConclusions,
          blocked_conclusions: blockedConclusions,
          strategy_source:
          workingStrategy?.strategy_source ?? "ai_reasoning",

          selected_strategy_id:
          workingStrategy?.selected_strategy_id ??
  legalAnalysisForGeneration?.reasoning_engine?.selected_position ??
  null,

ai_selected_strategy_id:
  workingStrategy?.ai_selected_strategy_id ??
  null,

lawyer_override_reason:
  workingStrategy?.lawyer_override_reason ??
  null,
  paragraph_provenance:
  generated?.paragraph_provenance ?? [],

  paragraph_provenance_version: 1,
          document_context_quality,
          document_context_summary,
          generation_used_document_context: Boolean(hasDocumentContext),
          jurisdiction,
          language,
          intake,
          attachments,
          special_instructions,
          schema,
          is_preliminary: true,
          requires_local_lawyer_review:
            generated.requires_local_lawyer_review || requiresLocalLawyerReview,
          missing_inputs: generated.missing_inputs || [],
          warnings: generated.warnings || [],
          quality_notes: generated.quality_notes || [],
          legal_reasoning: generated.legal_reasoning || {
          status: "not_generated",
          selected_laws: [],
          why_selected: [],
          fact_to_law_mapping: [],
          alternative_laws_considered: [],
          why_alternatives_rejected: [],
          supporting_court_practice: [],
          supporting_fns_letters: [],
          supporting_minfin_letters: [],
          missing_evidence: [],
         lawyer_review_required: true,
         },
         generated_at: new Date().toISOString(),
         model: "gemini-2.5-flash-lite",
        },
      })
      .select("id,title,category,status,content,template_key,created_at,metadata,intake_session_id")
      .single();

    if (insertError) throw insertError;
    const reasoning = generated.legal_reasoning || {};
const toSourceObject = (item: any) => {
  if (item && typeof item === "object") return item;
  return {
    title: String(item ?? ""),
    localization_missing: true,
    why_used:
      "Генератор вернул источник без точной локализации. Требуется ручная проверка статьи, пункта, абзаца или цитаты.",
  };
};

const pickText = (...values: any[]) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;

const parseArticle = (text: string) => {
  const direct = text.match(/(?:ст\.?|статья)\s*(\d+(?:\.\d+)?)/i);
  if (direct?.[1]) return direct[1];

  const nk541 = text.match(/\b54\.1\b/);
  if (nk541) return "54.1";

  return null;
};

const parsePoint = (text: string) => {
  const direct = text.match(/(?:п\.?|пункт)\s*(\d+(?:\.\d+)?)/i);
  return direct?.[1] ?? null;
};

const sourceLocalizationMetadata = (item: any) => {
  const source = toSourceObject(item);

  const searchable = [
    source.title,
    source.law,
    source.article,
    source.citation,
    source.quote,
    source.excerpt,
    source.text_preview,
    source.source_ref,
  ]
    .filter(Boolean)
    .join(" ");

  const article =
    pickText(source.article, source.article_number, source.law_article) ??
    parseArticle(searchable);

  const point =
    pickText(source.point, source.clause) ??
    parsePoint(searchable);

  const quote = pickText(
    source.quote,
    source.excerpt,
    source.citation,
    source.text_preview,
  );

  return {
    article,
    point,
    paragraph: pickText(source.paragraph),
    page: source.page ?? source.pages ?? null,
    quote,
    used_in:
      source.used_in ??
      source.used_conclusions ??
      source.used_arguments ??
      [],

    localization_missing:
      source.localization_missing ??
      (!article && !point && !source.paragraph && !source.page && !quote),

    case_number: source.case_number ?? null,
    court: source.court ?? null,
    date: source.date ?? null,
    number: source.number ?? null,
    law: source.law ?? null,
    source_ref: source.source_ref ?? null,
    raw_item: item,
  };
};
const makeSourceRow = (
  item: any,
  source_type: string,
  used_for: string,
) => {
  const source = toSourceObject(item);

  return {
    source_type,
    source_title:
      source.title ||
      source.law ||
      source.article ||
      source.case_number ||
      source.number ||
      String(item),
    official_url: source.official_url || source.url || null,
    used_for,
    why_used: source.why_used || source.reason || null,
    fact_to_law_link: source.fact_to_law_link || source.fact || null,
    metadata: sourceLocalizationMetadata(item),
  };
};

const sourceRows = [
  ...(Array.isArray(reasoning.selected_laws)
    ? reasoning.selected_laws.map((item: any) =>
        makeSourceRow(item, "law", "selected_laws"),
      )
    : []),

  ...(Array.isArray(reasoning.supporting_court_practice)
    ? reasoning.supporting_court_practice.map((item: any) =>
        makeSourceRow(item, "court_practice", "supporting_court_practice"),
      )
    : []),

  ...(Array.isArray(reasoning.supporting_fns_letters)
    ? reasoning.supporting_fns_letters.map((item: any) =>
        makeSourceRow(item, "fns_letter", "supporting_fns_letters"),
      )
    : []),

  ...(Array.isArray(reasoning.supporting_minfin_letters)
    ? reasoning.supporting_minfin_letters.map((item: any) =>
        makeSourceRow(item, "minfin_letter", "supporting_minfin_letters"),
      )
    : []),
].filter((row) => row.source_title && row.source_title !== "[object Object]");

if (sourceRows.length > 0) {
  const { error: sourcesError } = await supabase
    .from("generated_document_sources")
    .insert(
      sourceRows.map((row) => ({
        generated_document_id: inserted.id,
        source_type: row.source_type,
        source_title: row.source_title,
        official_url: row.official_url,
        used_for: row.used_for,
        why_used: row.why_used,
        fact_to_law_link: row.fact_to_law_link,
        current_status: row.official_url ? "unknown" : "needs_manual_check",
        verification_status: row.official_url ? "needs_check" : "missing_url",
        metadata: {
  source: "generate-legal-document-v2",
  created_from_legal_reasoning: true,
  ...(row.metadata ?? {}),
},
      })),
    );

  if (sourcesError) {
    console.error("Failed to save generated document sources:", sourcesError);
  }
}
    if (effectiveSessionId) {
  await supabase
    .from("document_intake_sessions")
    .update({
      generated_document_id: inserted.id,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", effectiveSessionId);
}
        // Auto AI legal review (не блокирует генерацию)
    if (effectiveSessionId) {
  try {
    const reviewResponse = await fetch(
      `${supabaseUrl}/functions/v1/review-generated-legal-document`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  document_id: inserted.id,
  legal_analysis_run_id,
}),
      },
    );

    if (!reviewResponse.ok) {
      const reviewError = await reviewResponse.text();
      console.error("Auto AI review failed:", reviewError);
    } else {
      console.log("Auto AI review completed:", inserted.id);
    }
  } catch (reviewError) {
    console.error("Auto AI review exception:", reviewError);
  }
} else {
  console.warn(
    "Auto AI review skipped: no intake session",
    inserted.id,
  );
}
    return json({
      success: true,
      generated_document_id: inserted.id,
      document: inserted,
      generated,
    });
  } catch (error) {
    console.error(error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

function slugify(input: string) {
  return String(input || "document")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
