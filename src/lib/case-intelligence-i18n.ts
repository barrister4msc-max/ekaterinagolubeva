const LABELS: Record<string, string> = {
  // ---------- статус ----------
  success: "Успешно",
  warning: "Предупреждение",
  blocked: "Заблокировано",
  failed: "Ошибка",
  passed: "Проверено",
  partial: "Частично",
  actual: "Актуально",
  outdated: "Устарело",
  unknown: "Не определено",
  requires_actuality_check: "Требует проверки актуальности",
  requires_manual_verification: "Требует ручной проверки",
  needs_check: "Требует проверки",

  // ---------- источники ----------
  laws: "Законодательство",
  law: "Закон",
  court: "Судебная практика",
  court_practice: "Судебная практика",
  fns: "Материалы ФНС",
  minfin: "Материалы Минфина",
  manuals: "Методические материалы",
  practice: "Практика",
  ekaterina: "Практика Екатерины",
  letters: "Письма",

  // ---------- исследование ----------
  documents_used: "Использовано документов",
  documents_total: "Всего документов",
  documents_rejected: "Отклонено документов",

  fns_found: "Материалы ФНС",
  laws_found: "Нормы законодательства",
  minfin_found: "Материалы Минфина",
  manuals_found: "Методические материалы",
  ekaterina_found: "Практика Екатерины",
  court_practice_found: "Судебная практика",

  sources_raw: "Найдено источников",
  sources_winners: "Отобрано источников",
  sources_after_caps: "После ограничения",
  sources_after_dedupe: "После удаления дублей",
  sources_after_enrich: "После обогащения",
  sources_after_ranking: "После ранжирования",
  sources_used_by_model: "Использовано ИИ",

  semantic_enabled: "Семантический поиск",
  gap_retry_used: "Повторный поиск",

  // ---------- provenance ----------
  qualification: "Квалификация",
  main_position: "Основная позиция",
  client_position: "Позиция доверителя",
  opponent_position: "Позиция оппонента",

  fact_to_law: "Факт → Норма",
  counter_argument: "Контраргумент",
  weak_point: "Слабое место",

  // ---------- вкладки ----------
  provenance: "Происхождение выводов",
  grounding: "Обоснование",
  quality_gate: "Контроль качества",
  evidence_graph: "Граф доказательств",
  evidence_matrix: "Матрица доказательств",

  // ---------- разделы ----------
  recommendations: "Рекомендации",
  documents: "Документы",
  facts: "Факты",
  laws_section: "Законы",
  practice_section: "Практика",
  letters_section: "Письма",
  manuals_section: "Методики",
};

export function trCaseLabel(value: unknown): string {
  if (value === null || value === undefined) return "";

  const key = String(value).trim();

  if (!key) return "";

  return LABELS[key] ?? key;
}
