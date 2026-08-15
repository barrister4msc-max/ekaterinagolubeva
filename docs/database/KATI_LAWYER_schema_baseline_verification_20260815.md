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
- Production grants: требуют отдельного security-review до включения в воспроизводимую миграционную цепочку.

