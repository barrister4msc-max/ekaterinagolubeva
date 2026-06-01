import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CATEGORIES = [
  "недвижимость",
  "аренда",
  "коммерческая аренда",
  "договоры",
  "суд",
  "налоговые проверки",
  "налоговые споры",
  "representation_abroad",
  "приставы",
  "наследство",
  "раздел имущества",
  "иное",
] as const;

const MAX_ROUNDS = 5;

const QASchema = z.array(
  z.object({
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(1500),
  }),
);

function getModel() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI временно недоступен. Попробуйте позже.");
  return createLovableAiGatewayProvider(key)("google/gemini-3-flash-preview");
}

const SYSTEM_INTAKE = `Ты — спокойный premium intake-помощник частного юридического советника по недвижимости в Москве. Тон тихий, профессиональный, по-человечески тёплый. НЕ робот, НЕ чатбот, НЕ стартап-AI.

Твоя задача:
1. Определить категорию обращения из списка: ${CATEGORIES.join(", ")}.
2. Задавать ПО ОДНОМУ короткому уточняющему вопросу за раз. Вопросы — конкретные, по существу, не более 12 слов. Без вежливых преамбул вроде "позвольте уточнить".
3. Когда уже понятна суть обращения и собрано 2–${MAX_ROUNDS} уточнений — вернуть done=true и next_question=null.
4. Максимум ${MAX_ROUNDS} раундов вопросов. После — обязательно done=true.

Примеры вопросов:
- "Квартира в ипотеке?"
- "Сколько собственников?"
- "Есть письменный договор аренды?"
- "В какой стране вы сейчас находитесь?"
- "Есть доверенное лицо в России?"`;

export const classifyAndAskFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        original_text: z.string().min(1).max(5000),
        qa: QASchema.max(MAX_ROUNDS),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const model = getModel();

    const history = data.qa.length
      ? "\n\nУже заданные вопросы и ответы:\n" +
        data.qa.map((x, i) => `${i + 1}. В: ${x.question}\n   О: ${x.answer}`).join("\n")
      : "";

    const prompt = `Исходное обращение клиента:\n"""${data.original_text}"""${history}\n\nРаундов уже было: ${data.qa.length}. Лимит: ${MAX_ROUNDS}.`;

    try {
      const { experimental_output } = await generateText({
        model,
        system: SYSTEM_INTAKE,
        prompt,
        experimental_output: Output.object({
          schema: z.object({
            category: z.enum(CATEGORIES),
            next_question: z.string().nullable(),
            done: z.boolean(),
          }),
        }),
      });

      const out = experimental_output;
      const forcedDone = data.qa.length >= MAX_ROUNDS;
      return {
        category: out.category,
        next_question: forcedDone ? null : out.next_question,
        done: forcedDone || out.done || !out.next_question,
      };
    } catch (e) {
      console.error("classifyAndAskFn error:", e);
      return {
        category: "иное" as const,
        next_question: null,
        done: true,
        error: true,
      };
    }
  });

const SYSTEM_FINALIZE = `Ты — premium intake-помощник частного юридического советника по недвижимости. На основе обращения и уточнений сформируй структурированную сводку для юриста.

Тон сводки: деловой, спокойный, без воды. Русский язык.

Поля:
- summary: 2–4 предложения, суть ситуации и ключевые факты.
- urgency: low | medium | high. high — если есть сроки, активный спор, угроза потери актива, исполнительное производство.
- risks: 2–5 коротких рисков (каждый ≤ 80 символов).
- next_step: один конкретный рекомендованный следующий шаг для юриста (≤ 160 символов).
- documents_checklist: 3–7 документов, которые стоит подготовить клиенту (каждый ≤ 80 символов).`;

export const finalizeLeadFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(200),
        phone: z.string().trim().min(1).max(50),
        contact: z.string().trim().max(200).optional().or(z.literal("")),
        original_text: z.string().min(1).max(5000),
        category: z.enum(CATEGORIES).nullable().optional(),
        qa: QASchema.max(MAX_ROUNDS),
        source: z.string().trim().max(100).optional(),
        utm_source: z.string().trim().max(200).optional().nullable(),
        utm_medium: z.string().trim().max(200).optional().nullable(),
        utm_campaign: z.string().trim().max(200).optional().nullable(),
        utm_content: z.string().trim().max(200).optional().nullable(),
        utm_term: z.string().trim().max(200).optional().nullable(),
        landing_url: z.string().trim().max(2000).optional().nullable(),
        referrer: z.string().trim().max(2000).optional().nullable(),
        consent: z.object({
          consent_given: z.boolean(),
          ai_processing_consent: z.boolean(),
          legal_disclaimer_accepted: z.boolean(),
          consent_text: z.string().min(1).max(4000),
          consent_version: z.string().max(50).default("2026-05"),
          privacy_policy_version: z.string().max(50).default("2026-05"),
          consent_source: z.string().max(100),
          page_url: z.string().max(2000).optional().nullable(),
          user_agent: z.string().max(1000).optional().nullable(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!data.consent.consent_given) {
      throw new Error("Не дано согласие на обработку персональных данных.");
    }

    let summary: string | null = null;
    let urgency: "low" | "medium" | "high" | null = null;
    let risks: string[] = [];
    let next_step: string | null = null;
    let documents_checklist: string[] = [];

    try {
      const model = getModel();
      const qaBlock = data.qa.length
        ? data.qa.map((x, i) => `${i + 1}. В: ${x.question}\n   О: ${x.answer}`).join("\n")
        : "(уточнений не было)";

      const prompt = `Категория: ${data.category ?? "не определена"}\n\nОбращение:\n"""${data.original_text}"""\n\nУточнения:\n${qaBlock}`;

      const { experimental_output } = await generateText({
        model,
        system: SYSTEM_FINALIZE,
        prompt,
        experimental_output: Output.object({
          schema: z.object({
            summary: z.string().min(1).max(800),
            urgency: z.enum(["low", "medium", "high"]),
            risks: z.array(z.string().min(1).max(120)).min(1).max(6),
            next_step: z.string().min(1).max(240),
            documents_checklist: z.array(z.string().min(1).max(120)).min(1).max(10),
          }),
        }),
      });

      summary = experimental_output.summary;
      urgency = experimental_output.urgency;
      risks = experimental_output.risks;
      next_step = experimental_output.next_step;
      documents_checklist = experimental_output.documents_checklist;
    } catch (e) {
      console.error("finalizeLeadFn AI error:", e);
    }

    const consent = data.consent;
    const nowIso = new Date().toISOString();

    const consentPayload = {
      consent_given: true,
      consent_timestamp: nowIso,
      consent_version: consent.consent_version,
      consent_source: consent.consent_source,
      privacy_policy_version: consent.privacy_policy_version,
      ai_processing_consent: consent.ai_processing_consent,
      legal_disclaimer_accepted: consent.legal_disclaimer_accepted,
      consent_user_agent: consent.user_agent ?? null,
    };

    console.log("[finalizeLeadFn] inserting lead", {
      name: data.name,
      phone: data.phone,
      category: data.category ?? null,
      source: data.source ?? "website",
      consent_input: {
        consent_given: consent.consent_given,
        ai_processing_consent: consent.ai_processing_consent,
        legal_disclaimer_accepted: consent.legal_disclaimer_accepted,
        consent_source: consent.consent_source,
        consent_version: consent.consent_version,
        privacy_policy_version: consent.privacy_policy_version,
      },
      consent_payload_to_db: consentPayload,
    });

    const { data: inserted, error } = await supabaseAdmin
      .from("leads")
      .insert({
        name: data.name,
        phone: data.phone,
        contact: data.contact || null,
        original_text: data.original_text,
        category: data.category ?? null,
        qa: data.qa,
        ai_summary: summary,
        urgency: urgency,
        risks,
        next_step,
        documents_checklist,
        source: data.source ?? "website",
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_content: data.utm_content ?? null,
        utm_term: data.utm_term ?? null,
        landing_url: data.landing_url ?? null,
        referrer: data.referrer ?? null,
        ...consentPayload,
      } as never)
      .select("id, consent_given, consent_timestamp, consent_source, consent_version, privacy_policy_version, ai_processing_consent, legal_disclaimer_accepted")
      .single();


    if (error) {
      console.error("Lead insert error:", error);
      throw new Error("Не удалось сохранить обращение. Попробуйте позже.");
    }

    const leadId = (inserted as { id: string }).id;
    console.log("[finalizeLeadFn] lead inserted — DB returned:", inserted);

    const { data: consentRow, error: consentErr } = await supabaseAdmin
      .from("lead_consents")
      .insert({
        lead_id: leadId,
        consent_type: "personal_data_and_ai_processing",
        consent_text: consent.consent_text,
        consent_version: consent.consent_version,
        privacy_policy_version: consent.privacy_policy_version,
        consent_source: consent.consent_source,
        consent_given: true,
        ai_processing_consent: consent.ai_processing_consent,
        legal_disclaimer_accepted: consent.legal_disclaimer_accepted,
        user_agent: consent.user_agent ?? null,
        page_url: consent.page_url ?? null,
      } as never)
      .select("id, consent_given, ai_processing_consent, legal_disclaimer_accepted")
      .single();
    if (consentErr) console.error("[finalizeLeadFn] lead_consents insert error:", consentErr);
    else console.log("[finalizeLeadFn] lead_consents inserted:", consentRow);

    const { data: evRow, error: evErr } = await supabaseAdmin
      .from("lead_events")
      .insert({
        lead_id: leadId,
        type: "consent_given",
        message: "Пользователь дал согласие на обработку персональных данных и AI-анализ обращения.",
      } as never)
      .select("id, type")
      .single();
    if (evErr) console.error("[finalizeLeadFn] lead_events insert error:", evErr);
    else console.log("[finalizeLeadFn] lead_events inserted:", evRow);


    return { id: leadId, summary, urgency, next_step };
  });

