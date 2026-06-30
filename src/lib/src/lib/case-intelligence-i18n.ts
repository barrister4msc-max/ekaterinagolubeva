export const CASE_I18N: Record<string, string> = {
  // ===== Общие =====
  success: "Успешно",
  warning: "Предупреждение",
  warn: "Предупреждение",
  blocked: "Заблокировано",
  failed: "Ошибка",
  passed: "Проверено",
  draft: "Черновик",

  // ===== Quality =====
  QualityGate: "Контроль качества",
  quality_gate: "Контроль качества",
  quality: "Качество",
  quality_score: "Оценка качества",
  grounding: "Обоснованность",
  Grounding: "Обоснованность",

  // ===== Provenance =====
  provenance: "Происхождение выводов",
  ProvenanceExplorer: "Анализ происхождения выводов",
  provenance_explorer: "Анализ происхождения выводов",

  // ===== Qualification =====
  qualification: "Правовая квалификация",

  // ===== Позиции =====
  main_position: "Основная позиция",
  client_position: "Позиция клиента",
  opponent_position: "Позиция оппонента",

  // ===== Логика =====
  fact_to_law: "Связь фактов с нормами права",
  counter_argument: "Контраргументы",
  weak_point: "Слабые места",

  // ===== Источники =====
  facts: "Факты",
  fact: "Факт",
  documents: "Документы",
  document: "Документ",
  laws: "Законы",
  court_practice: "Судебная практика",
  manuals: "Методические материалы",
  letters: "Письма",
  sources: "Источники",

  // ===== Статусы =====
  actual: "Актуально",
  outdated: "Устарело",
  unknown: "Не определено",
  needs_check: "Требует проверки",
  requires_actuality_check: "Требует проверки актуальности",
  requires_manual_verification: "Требует ручной проверки",
  missing_url: "Нет ссылки",

  // ===== OCR =====
  ocr: "OCR",

  // ===== Matter =====
  matter_snapshot: "Снимок дела",

  // ===== Matrix =====
  evidence_matrix: "Матрица доказательств",

  // ===== Review =====
  ai_review: "AI проверка",

  // ===== Review =====
  lawyer_review: "Проверка юристом",

  // ===== History =====
  history: "История",
  history_ai: "История AI",
};

export function tr(v: unknown): string {
  if (v == null) return "";

  const s = String(v);

  return CASE_I18N[s] ?? s;
}
