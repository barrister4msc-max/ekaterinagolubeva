## Frontend Document Lifecycle — KATI LAWYER

Этап **Frontend Stabilization**: только UI/UX и фронтенд-логика. БД, RLS, Edge Functions, схема версий — **не трогаем**.

---

### 1. Навигация Workspace (`src/routes/workspace.tsx`)

Заменить пункт «Мои черновики» на 4 раздела:

```
📄 Конструктор документов   → /workspace/document-builder
📋 Мои опросники            → /workspace/intakes
📝 Мои документы            → /workspace/generated-documents
🗄 Архив                    → /workspace/archive
```

Старый маршрут `/workspace/document-drafts` оставляем рабочим (backward compat), но из меню убираем.

---

### 2. Новые routes (файлы)

| Файл | Назначение |
|---|---|
| `src/routes/workspace.intakes.tsx` | Список опросников (`document_intake_sessions` + `document_intake_answers`) |
| `src/routes/workspace.generated-documents.tsx` | Список сформированных документов (`generated_legal_documents`) с фильтрами |
| `src/routes/workspace.generated-documents.$documentId.versions.tsx` | История версий (parent_document_id / version_number) |
| `src/routes/workspace.generated-documents.$documentId.revise.tsx` | Workflow «Пересмотреть документ» |
| `src/routes/workspace.archive.tsx` | Архивные опросники и документы (`archived_at IS NOT NULL`) |

Оставляем как есть:
- `workspace.document-builder.tsx` (читает `?sessionId=` — уже поддерживает или добавим чтение search-param)
- `workspace.document-drafts.*` (backward compat)

---

### 3. Раздел «Мои опросники»

**Источник:** `document_intake_sessions` + count из `document_intake_answers` и `generated_legal_documents`.

**Карточка опросника (JSX):**
- Название шаблона + `template_code`
- Дата создания / обновления
- Прогресс заполнения = `answered / total_questions` (по схеме шаблона)
- Бейдж AI-заполнения (если хоть один answer имеет `source = 'ai'`)
- Кол-во связанных `generated_legal_documents`
- Статус: 🟡 «В работе» / 🟢 «Готов к формированию»

**Действия:** `[Продолжить работу]` → `/workspace/document-builder?sessionId=<id>`, `[История AI]` → существующий `/workspace/document-drafts/$sessionId/ai-history`, `[Архивировать]` → существующий RPC `archive_document_intake_session`.

Восстановление состояния формы — в `document-builder` через чтение `sessionId` из search-params (если ещё не реализовано — добавить хук загрузки сессии и ответов).

---

### 4. Раздел «Мои документы»

**Источник:** `generated_legal_documents` (только корневые версии — `parent_document_id IS NULL` или последняя версия в цепочке; в карточке показываем «v{N}»).

**Карточка (JSX):**
- Название, `version_number`, дата создания
- AI review status, статус юриста, кто одобрил, дата утверждения
- Действия: `[Открыть]`, `[История версий]`, `[Пересмотреть]`, `[Архивировать]`

**Фильтры** (клиентские, по полям таблицы):
Все · AI черновики · На проверке · Одобренные · Финальные · Требующие пересмотра.

---

### 5. Workflow «Пересмотреть документ»

Route: `/workspace/generated-documents/$documentId/revise`.

Доступен **для любого статуса** (AI draft / review / approved / final).

**Шаги (UI-стейт-машина, без новых таблиц):**

1. **Загрузка материалов** — переиспользуем существующий загрузчик в `documents` (тот же storage bucket / таблица, что используется в intake).
2. **AI-анализ изменений** — вызов существующей Edge Function `review-generated-legal-document` с дополнительным флагом `run_type = 'revision_analysis'` и `parent_document_id`. Результат рендерим в секциях:
   - Новые факты · Изменённые факты · Противоречия · Недостающие доказательства
   - Изменение правовой оценки (нормы было/стало, альтернативы)
   - Судебная практика (за / против / противоречивая)
   - Риски: было / стало / причина
3. **Решение юриста:**
   - `[Оставить текущую версию актуальной]` — закрыть workflow, ничего не пересоздавать.
   - `[Создать новую версию]` — insert в `generated_legal_documents` с `parent_document_id = currentId`, `version_number = current + 1`, копируем `session_id`, content draft (или генерируем через существующую функцию генерации). Старая версия не меняется.

Никаких изменений схемы — поля `parent_document_id` и `version_number` уже существуют.

---

### 6. Архив

Объединённый список: опросники с `archived_at IS NOT NULL` + документы со статусом `archived` (используем существующие поля). Кнопка «Восстановить» через существующий RPC `restore_document_intake_session`.

---

### 7. Места для будущего Evidence Layer (комментарии `// EVIDENCE_LAYER:` в коде)

- В карточке документа — место для блока «Доказательная база версии».
- В workflow пересмотра, шаг 1 — там, где сейчас просто загрузка `documents`, в будущем появится привязка каждого файла к факту/норме.
- В AI-анализе — секция «Доказательства за/против» будет питаться из Evidence-графа, сейчас читается из AI-ответа.
- В решении юриста — поле «обоснование выбора» уйдёт в Evidence-журнал.

---

### Файлы, которые изменим

**Новые:**
- `src/routes/workspace.intakes.tsx`
- `src/routes/workspace.generated-documents.tsx`
- `src/routes/workspace.generated-documents.$documentId.versions.tsx`
- `src/routes/workspace.generated-documents.$documentId.revise.tsx`
- `src/routes/workspace.archive.tsx`
- `src/components/workspace/intake-card.tsx`
- `src/components/workspace/generated-document-card.tsx`
- `src/components/workspace/revision-analysis-panel.tsx`

**Изменим:**
- `src/routes/workspace.tsx` — навигация (заменить пункт «Мои черновики» на 4 новых).
- `src/routes/workspace.document-builder.tsx` — чтение `?sessionId=` и восстановление состояния (если не реализовано).

**Не трогаем:** БД, миграции, RLS, Edge Functions, существующие `document-drafts.*` маршруты, `generate-legal-document` / `review-generated-legal-document`.

---

### Что НЕ делаем на этом этапе

- Новых таблиц нет.
- RLS не меняем.
- Логику генерации документов и AI-review не переписываем — только новые точки вызова с существующими параметрами.
- Реальный Evidence Layer — следующий этап, сейчас только UI-якоря и комментарии.

После одобрения плана — реализую файлы списком в одной серии правок.