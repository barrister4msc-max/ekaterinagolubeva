
## Что строим

AI-помощник, встроенный в форму на `/contact` (не отдельный чатбот). Пользователь описывает ситуацию → AI определяет категорию → задаёт 2–5 адаптивных уточняющих вопросов → формирует структурированную заявку → сохраняет в БД → видна в `/admin` CRM.

## База данных (миграция)

Таблица `leads`:
- `name`, `phone`, `contact` (email/telegram/прочее, опционально)
- `original_text` (исходное описание клиента)
- `category` (текст: недвижимость / аренда / коммерческая аренда / договоры / суд / representation_abroad / приставы / наследство / раздел имущества / иное)
- `qa` (jsonb: массив `{question, answer}` из адаптивных вопросов)
- `ai_summary` (текст), `urgency` (enum: low/medium/high), `risks` (text[]), `next_step` (text), `documents_checklist` (text[])
- `status` (enum: new/in_progress/waiting/closed) — default `new`
- `admin_notes` (text)
- стандартные created_at / updated_at

RLS:
- INSERT — `anon` и `authenticated` (форма публичная, без auth)
- SELECT/UPDATE — только `admin` (через `has_role`)

## Backend (TanStack server functions)

`src/lib/intake.functions.ts`:
- `classifyAndAskFn({ message, history })` — публичный (без auth). Вызывает Lovable AI Gateway (`google/gemini-3-flash-preview`) со структурированным выводом (`Output.object` + Zod):
  - `category`
  - `next_question` (string | null — null если уже достаточно информации, max 5 раундов)
  - `done` (boolean)
- `finalizeLeadFn({ name, phone, contact, original_text, category, qa })` — публичный. Вызывает AI для генерации summary/urgency/risks/next_step/documents_checklist, затем INSERT в `leads` через `supabaseAdmin`.

`src/lib/admin-leads.functions.ts` (protected `requireSupabaseAuth` + admin check):
- `listLeadsFn({ status?, category? })`
- `updateLeadFn({ id, status?, admin_notes? })`

AI Gateway helper: `src/lib/ai-gateway.ts` с `createLovableAiGatewayProvider`.

## Frontend

### `/contact` (переписать)
Editorial calm UI, soft beige, без чат-бабблов. Шаги внутри одной «intake card» с плавными переходами:

1. **Step 1 — Описание + контакты**: заголовок «Кратко опишите ситуацию — помогу понять, с чего начать», подзаголовок (из брифа). Поля: Имя, Телефон, Краткое описание (textarea). Кнопка «Продолжить».
2. **Step 2 — Адаптивные уточнения**: показывает по одному вопросу за раз (до 5), вызывая `classifyAndAskFn` после каждого ответа. Тихая анимация fade/slide. Бейдж определённой категории сверху ненавязчиво.
3. **Step 3 — Финал**: spinner «Готовлю обращение…», вызывается `finalizeLeadFn`. После — экран благодарности с краткой выжимкой (что передано), без публикации risks/urgency клиенту (только «ваше обращение сформировано»).

Слева в layout — как сейчас, мессенджеры и контакты.

### `/admin` (расширить)
Текущий `/admin` — это hero-портрет. Добавляю таб/секцию «Заявки» (или просто новый блок ниже): таблица leads с фильтрами по `status` и `category`, развернуть строку → видны original_text, qa, ai_summary, urgency, risks, next_step, documents_checklist. Поля редактируемые: `status`, `admin_notes`. Кнопка «Экспорт CSV».

## Технические заметки

- Lovable AI Gateway, модель по умолчанию `google/gemini-3-flash-preview`, используется `ai` + `@ai-sdk/openai-compatible` + `zod` (установить если нет).
- Промпты на русском, тон «спокойный premium advisor».
- Системный промпт для классификации содержит явный список категорий и инструкцию: «задавай ОДИН следующий вопрос; если данных достаточно или задано 5 вопросов — верни done=true».
- Финализация: отдельный вызов с полным контекстом, schema на 5 полей.
- Все AI-вызовы — на сервере, `LOVABLE_API_KEY` не уходит в браузер.
- Ошибки AI (429/402) показываются с понятным текстом; форма позволяет всё равно отправить заявку без AI-обогащения (graceful fallback — сохраняем без summary).

## Порядок работ

1. Миграция БД (`leads` + enums + RLS).
2. Установить deps: `ai`, `@ai-sdk/openai-compatible`, `zod` (если нет).
3. Создать `ai-gateway.ts`, `intake.functions.ts`, `admin-leads.functions.ts`.
4. Переписать `/contact` под пошаговый AI-флоу.
5. Расширить `/admin` секцией CRM.
6. Smoke test через preview.
