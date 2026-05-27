import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type ChatRequestBody = { messages?: unknown };

const SYSTEM_PROMPT = `Ты — вежливый ассистент юриста Екатерины Голубевой (Legal Real Estate Advisor, Москва).
Специализация: недвижимость, аренда, договоры, судебные споры, представительство за границей.

Правила:
- Отвечай кратко, по-русски, спокойным деловым тоном.
- Давай только общую правовую ориентацию, не индивидуальную консультацию.
- Если вопрос требует разбора документов или ситуации — предложи оставить заявку через форму «Связаться» или написать в Telegram/WhatsApp.
- Никаких выдуманных цен, сроков и гарантий. Не упоминай конкретные статьи без уверенности.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages as UIMessage[] });
      },
    },
  },
});
