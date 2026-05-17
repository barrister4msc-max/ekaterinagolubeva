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
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
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
      // Graceful fallback: save lead without AI enrichment
    }

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
      })
      .select("id")
      .single();

    if (error) {
      console.error("Lead insert error:", error);
      throw new Error("Не удалось сохранить обращение. Попробуйте позже.");
    }

    return { id: inserted.id, summary, urgency, next_step };
  });
