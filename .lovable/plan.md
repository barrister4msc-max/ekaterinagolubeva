# PR #88 — Matter-scoped Entity Registry для обезличивания

Цель: несколько организаций и связанных сторон в одном деле никогда не смешиваются между документами. Один субъект = один стабильный токен ([ORG_001], [AUTH_001], [PERSON_001]) во всех документах дела; слияние только по надёжным реквизитам; финальная подстановка — детерминированный server-side резолвер.

## Что уже есть (проверено в коде)

- `src/lib/legal-redaction.ts` — извлечение сущностей из текста документа, нумерация per-document (`[COMPANY_1]`, счётчики в `redactLegalDocument`), whitelist госорганов (ФНС/суды) — они сейчас НЕ обезличиваются вовсе.
- `src/lib/redaction-field-mapping.ts` — session-scoped карта `token → canonical_value` для полей анкеты (`version: 1`, `tokens`, `fields`), fail-closed восстановление `restoreCanonicalAnswers`, страж `assertNoRedactionTokens`.
- `src/lib/document-intake-storage.ts` — карта и флаг живут в `document_intake_sessions.metadata.intake_redaction`; run_id — в `metadata.intake_ai_fill.run_id` (`saveGenerationContext` / `loadGenerationContext`).
- `src/lib/generate-legal-document.ts` — перед генерацией восстанавливает канонические значения и падает при отсутствии карты.
- `src/lib/company-registry.ts` — нормализация ИНН/ОГРН/наименования/адреса, `detectCompanyConflicts`, verified-профиль DaData.
- `src/components/document-builder/intake-form.tsx` — авто AI-fill, режим обезличивания, ручные правки через `applyManualFieldEdit`.

Пробел: нумерация токенов существует отдельно для текста каждого документа и отдельно для полей анкеты; общей идентичности субъекта на уровне дела нет.

## Модель (versioned metadata bridge, без DDL)

Новый модуль `src/lib/entity-registry.ts` (чистые функции, без БД):

```text
EntityRegistry v1  (хранится в document_intake_sessions.metadata.entity_registry)
├─ entities[]   entity_id (ORG_001…), entity_type (ORGANIZATION|PERSON|TAX_AUTHORITY|BANK),
│               canonical { name, inn, ogrn, kpp, address }, status: verified|unverified|needs_review
├─ mentions[]   entity_id, document_id, locator (поле анкеты или span-индекс), model_safe_mention
├─ roles[]      entity_id, document_id|null (matter-scope), role: taxpayer|counterparty|supplier|
│               claimant|respondent|tax_authority|bank
├─ relations[]  from_entity_id, type (HAS_COUNTERPARTY|ISSUED_DOCUMENT|PAID), to_entity_id,
│               provenance { document_id }, confidence
└─ conflicts[]  entity_ids[], reason (similar_name|inn_mismatch), status: needs_review
```

Правила идентичности (`resolveEntityIdentity`):
- совпадение нормализованного ИНН или ОГРН → та же entity (merge);
- нормализованное имя + подтверждённый реквизит (ИНН/ОГРН/КПП) → merge;
- только имя, только адрес, любая нечёткость → НЕ merge; создаётся отдельная entity + запись в `conflicts` со `status: needs_review`;
- госорган (whitelist из `legal-redaction.ts`) → `TAX_AUTHORITY`, никогда не получает роль `taxpayer`.

Реальные значения (наименование, ИНН, ОГРН, КПП, адрес) остаются только в `canonical` внутри session metadata; в модель уходит проекция `buildModelFacingEntityContext()` — только `entity_id`, `entity_type`, роли, ссылки на relations, confidence/status.

## Data-flow

```text
upload → OCR (original OCR остаётся server-side, как сейчас)
      → redactLegalDocument(text)                  [существующий детектор сущностей]
      → registerEntitiesFromDocument(registry, entities, document_id)
            ├─ identity match по ИНН/ОГРН/имя+реквизит
            └─ выдача стабильного entity_id/token
      → повторная подстановка: placeholder документа → token реестра ([ORG_002])
      → AI-fill / analyze-document-legal-position получают только model-facing проекцию
      → анкета: redaction-field-mapping использует entity token там, где поле ссылается
        на известную entity (иначе прежнее поведение [PERSON_1] сохраняется)
      → save в document_intake_sessions.metadata.entity_registry (рядом с intake_redaction)
      → generation: resolveEntityTokens() → канонические значения только для
        verified / lawyer-approved; needs_review/unresolved → блок по текущей политике
        (RedactionMappingError, как сейчас)
```

## Изменяемые файлы

- `src/lib/entity-registry.ts` — новый: типы, идентичность, слияние, конфликты, токены, model-facing проекция, детерминированный резолвер.
- `src/lib/legal-redaction.ts` — минимальная точка расширения: опциональный аргумент «внешний нумератор токенов», чтобы документные placeholders брались из реестра. Существующее поведение без реестра не меняется.
- `src/lib/redaction-field-mapping.ts` — учитывать entity-токены при построении карты полей; `restoreCanonicalAnswers` умеет резолвить и entity-токены (тот же fail-closed).
- `src/lib/document-intake-storage.ts` — чтение/запись `metadata.entity_registry` (versioned reader: отсутствие ключа = legacy-режим).
- `src/lib/generate-legal-document.ts` — резолв entity-токенов перед генерацией; блок/предупреждение при `needs_review`.
- `src/components/document-builder/intake-form.tsx` — прокинуть реестр в существующий контур обезличивания; при необходимости краткий индикатор конфликтов.
- `src/routes/workspace.document-builder.tsx` — передать реестр из `loadGenerationContext` в `prepareAndGenerate`.
- `supabase/tests/pr88-entity-registry.test.ts` — новый набор тестов.

DDL/миграция не планируется: `document_intake_sessions.metadata` уже используется как versioned-хранилище этого контура, RLS на сессии уже действует. Если на этапе реализации выяснится, что нужен матерь-скоуп шире сессии, вынесу это отдельным решением, а не молчаливым DDL.

## Тесты

- две похожие организации → два токена + `conflicts.needs_review`;
- одна организация в двух документах → один токен;
- одна организация в разных ролях → один `entity_id`, разные `roles`;
- точное совпадение ИНН → merge;
- совпадение только по имени → нет merge;
- налоговый орган не получает роль `taxpayer`;
- mentions/relations хранят `document_id`;
- model-facing payload не содержит названий/ИНН/адресов;
- резолвер подставляет корректные значения для ORG_001 vs ORG_002;
- `needs_review`/unresolved блокирует генерацию;
- регрессия: весь текущий `bun test` (в т.ч. pr22/pr24/pr25/pr27/pr32).

## Что НЕ меняется

- legacy `legal_analysis` остаётся authoritative; canonical facts/evidence, Evidence Matrix, Argument Map, Reasoning Engine, Challenge, `working_strategy`, `generation_conclusions`, `blocked_conclusions` — без изменений.
- PR #40, PR #81, TAXOFFENCE, любые edge functions, кроме перечисленных выше файлов, не трогаются.
- Контракт `run_id`, `document_local`, приватность исходного OCR, поведение авто AI-fill из PR #88 сохраняются.
- Никакого нового анализатора, движка или параллельного реестра; никакого merge/deploy — PR #88 остаётся Draft.
