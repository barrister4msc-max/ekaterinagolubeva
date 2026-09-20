# KATI LAWYER — проверка schema baseline и пяти налоговых шаблонов

Дата: 15.08.2026  
Production project: `wiylzbdbjokignwvizxt`  
Preview project: `ifitmxpnovghhfspqbkc`

## Итог

Каталоговый schema-only baseline воспроизведён в изолированной Preview без изменения production.

Совпадение ядра схемы:

| Объекты | Production | Preview |
|---|---:|---:|
| Таблицы | 95 | 95 |
| Constraints | 270 | 270 |
| Индексы | 344 | 344 |
| Пользовательские функции | 10 | 10 |
| Триггеры | 33 | 33 |
| Views | 8 | 8 |
| RLS-политики | 133 | 133 |
| Enum-типы | 3 | 3 |
| Sequences | 1 | 1 |

Во время реального прогона устранены два дефекта автоматически построенного DDL:

1. FK были переупорядочены после PK/UNIQUE/CHECK.
2. Исправлено экранирование перевода строки в восьми view definitions.

## T0-B / T0-C

Существующие T0-B и T0-C применены только в Preview. Production не изменялся.

Верхние пять TAX-шаблонов:

| № | Код | Название | Шагов | Полей | Обязательных |
|---:|---|---|---:|---:|---:|
| 1 | `response_to_tax_request` | Ответ на требование налогового органа | 7 | 27 | 7 |
| 2 | `tax_explanations` | Пояснения в налоговый орган | 7 | 21 | 7 |
| 3 | `tax_vat_explanations` | Пояснения по НДС | 7 | 27 | 6 |
| 4 | `tax_strategy_memo` | Меморандум по налоговой стратегии | 7 | 22 | 9 |
| 5 | `tax_court_position` | Позиция в суд | 7 | 27 | 10 |

Для всех пяти подтверждено:

- `sort_order` и `flagship_rank` равны 1–5;
- `metadata.flagship = true`;
- Registry и Intake-схема активны;
- `requires_intake = true`;
- обязательные поля совпадают с `required_fields`;
- отсутствуют пропущенные обязательные поля;
- имена полей уникальны;
- нет пустых `name`, `label` или `type`.

## Consumer-проверка

Код подтверждает:

- Document Builder ставит категорию TAX первой;
- внутри категории сортирует по `sort_order`;
- Intake adapter нормализует legacy `name` в канонический `key`;
- Analyzer получает шаблон через канонический `getTemplateByCode`;
- lookup использует `legal_document_templates`.

Целевые Bun-тесты не запускались: Bun отсутствует в текущей среде. SQL/runtime-contract проверен через Preview и read-only анализ кода.

## Security quarantine

Production содержит широкие grants: 303 агрегированных table grants, 32 function grants и 3 sequence grants. Они не перенесены в baseline автоматически.

Security Advisors дополнительно выявили:

- пять таблиц с RLS, но без политик;
- расширение `vector` в `public`;
- пять `SECURITY DEFINER` функций, доступных слишком широким ролям.

В Preview выдан только минимальный `SELECT` роли `authenticated` на:

- `legal_document_templates`;
- `document_intake_schemas`.

## Статус

- Core schema baseline: VERIFIED в Preview.
- T0-B: VERIFIED в Preview.
- T0-C: VERIFIED в Preview.
- Пять TAX flagship: ACCEPTED.
- Production: не изменён.
- Полный merge в GitHub: не выполнялся.
- Production grants: отдельно проверены; least-privilege кандидат прошёл
  изолированный replay и остаётся в карантине до authenticated E2E smoke tests.

## Disposable replay №2

Создана отдельная платная тестовая ветка `schema-baseline-replay-20260815`
(`zdeuhlgtcnjyaqkicgne`). Стоимость ветки на момент создания: `$0.01344/hour`.

Исходная Git-цепочка воспроизвела дефект: статус `MIGRATIONS_FAILED`, применились
только первые пять исторических миграций, в `public` было 4 таблицы.

После очистки только disposable `public` и применения baseline одним tracked
migration-run подтверждены исходные 95 таблиц и остальные контрольные значения.

Затем отдельно восстановлены и проверены:

- 1 trigger `on_auth_user_created` на `auth.users`;
- 3 storage buckets: `communication-attachments`, `hero`, `lead-documents`;
- 12 production-equivalent RLS-политик `storage.objects`;
- 23 строки legacy `document_templates`;
- 197 строк `legal_document_templates`, из них 194 активные после повторного T0-B;
- 5 активных flagship intake schemas;
- две миграции Canonical Relations: shadow runs и consumer observations;
- T0-B, deprecated-session restore и T0-C.

Итоговая схема candidate-state после добавления двух Canonical Relations таблиц:

| Объекты | Candidate |
|---|---:|
| Таблицы | 97 |
| Constraints | 287 |
| Индексы | 355 |
| Пользовательские функции | 10 |
| Триггеры public | 33 |
| Views | 8 |
| RLS-политики public | 134 |

Platform status disposable-ветки остаётся `MIGRATIONS_FAILED`, потому что она была
создана из старой Git-цепочки. Прямые tracked migration-runs подтверждают SQL, но не
заменяют обязательную проверку новой Git-цепочки с нуля.

## Least-privilege replay

Disposable branch `least-privilege-replay-20260815`
(`stfvcjjvtbllligfayut`, `$0.01344/hour`) воспроизвела старый статус
`MIGRATIONS_FAILED`, после чего приняла проверенный replacement order и
консолидированный grants-кандидат.

Post-replay ACL-проверки подтвердили:

- anon: `INSERT` только на `property_search_requests`; `SELECT` только на
  `external_reviews`, `seo_pages` и `site_settings`;
- у anon нет sequence grants и права выполнять public-функции;
- authenticated: только четыре проверенных RPC;
- service role: доступны backend vector-match функции;
- все восемь security-invoker views выполняются под `authenticated`;
- итоговые значения сохранены: 97 таблиц, 197 registry templates, 194 active и
  все пять flagship templates.
