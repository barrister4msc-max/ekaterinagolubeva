// Template-specific review profiles.
// Minimal-invasive registry: getReviewProfile(code) returns null for
// unknown profiles → reviewer keeps its universal checklist.
// Only touches the standard `run_type === "review"` branch; revision_analysis
// is not affected.

export type ReviewProfile = {
  review_profile: string;
  document_type: string;
  extra_checks: string[];
  do_not_flag: string[];
};

const PROFILES: Record<string, ReviewProfile> = {
  tax_request_response: {
    review_profile: "tax_request_response",
    document_type: "Ответ на требование налогового органа",
    extra_checks: [
      "Соответствует ли документ именно ответу на требование налогового органа.",
      "Есть ли связь с фактическими пунктами требования.",
      "Структурирован ли ответ по известным вопросам требования.",
      "Нет ли выдуманных приложений или документов.",
      "Не утверждается ли представление документа без основания.",
      "Нет ли признания нарушения без подтверждения.",
      "Корректно ли отделены представляемые документы от отсутствующих.",
      "Отражены ли missing evidence.",
      "Не превращён ли документ в иск, жалобу, судебную позицию или абстрактное правовое заключение.",
    ],
    do_not_flag: [
      "Отсутствие реквизитов требования, ИФНС или должностного лица, если пользователь их не предоставил.",
    ],
  },

  tax_explanations: {
    review_profile: "tax_explanations",
    document_type: "Пояснения в налоговый орган",
    extra_checks: [
      "Соответствует ли документ форме пояснений.",
      "Раскрыты ли фактические обстоятельства.",
      "Объяснены ли расхождения, если они известны.",
      "Отделена ли позиция налогоплательщика от установленных фактов.",
      "Указаны ли подтверждающие документы только при наличии данных.",
      "Нет ли фиктивных приложений.",
      "Не превращён ли документ в иск, жалобу или внутреннее legal memo.",
    ],
    do_not_flag: [
      "Отсутствие элементов, которые не относятся к конкретному кейсу.",
    ],
  },

  vat_explanations: {
    review_profile: "vat_explanations",
    document_type: "Пояснения по НДС",
    extra_checks: [
      "Если релевантно кейсу — проверь: налоговый период, характер расхождений, операции, счета-фактуры, книгу покупок, книгу продаж, оплату, поставку, принятие к учёту, использование в облагаемой деятельности, позицию по вычету / налоговой базе, доказательства.",
      "Особо выявляй выдуманные счета-фактуры, номера, суммы, даты, оплату, поставку, транспортировку, записи книг покупок/продаж.",
    ],
    do_not_flag: [
      "Отсутствие элемента, который не относится к конкретному кейсу, не считать ошибкой автоматически.",
    ],
  },

  tax_strategy_memo: {
    review_profile: "tax_strategy_memo",
    document_type: "Стратегия защиты по налоговому спору",
    extra_checks: [
      "Документ действительно является стратегическим memo (не иск, не жалоба, не ответ ФНС).",
      "Considered positions отражены, если они существуют.",
      "Несколько стратегий рассмотрены, если они есть в reasoning data.",
      "Selected working strategy соответствует WORKING STRATEGY.",
      "Если strategy_source == 'lawyer_override' — документ не подменяет стратегию юриста AI-стратегией.",
      "Указана причина выбора стратегии.",
      "Есть сильные стороны, слабые стороны, риски, evidence gaps, counterarguments, ответы на контраргументы, action plan, пошаговые действия.",
      "blocked_conclusions и blocked_arguments не используются как основания рекомендации.",
    ],
    do_not_flag: [
      "Отсутствие суда, номера дела, просительной части или структуры иска — memo не является процессуальным документом.",
    ],
  },

  tax_court_position: {
    review_profile: "tax_court_position",
    document_type: "Правовая позиция налогоплательщика для арбитражного суда",
    extra_checks: [
      "Судебная структура выдержана.",
      "Стороны, суд, номер дела указаны только если данные были предоставлены.",
      "Предмет спора, фактические обстоятельства, позиция ФНС, позиция налогоплательщика раскрыты.",
      "Правовая квалификация и аргументация по эпизодам присутствуют.",
      "Для ключевых аргументов прослеживается: факт → доказательство → норма → вывод.",
      "Процессуальные нарушения указаны корректно.",
      "Судебная практика подтверждена trusted_sources / RAG.",
      "Есть контраргументы и ответы на них.",
      "Просительная часть уместна.",
      "Provenance сохранён.",
      "Нет выдуманных судебных реквизитов.",
    ],
    do_not_flag: [
      "Отсутствие номера дела не считать hallucination, если номер дела не был предоставлен.",
      "Не считать ошибкой отсутствие необязательных исходных данных.",
    ],
  },
};

export function getReviewProfile(
  profileKey: string | null | undefined,
): ReviewProfile | null {
  if (!profileKey) return null;
  return PROFILES[profileKey] ?? null;
}

/**
 * Resolve review profile from generated document metadata without requiring
 * frontend changes. Fallback chain:
 *   metadata.review_profile
 *   → metadata.generation_profile
 *   → metadata.template_code
 *   → doc.template_code
 *   → null (universal review)
 */
export function resolveReviewProfile(doc: any): ReviewProfile | null {
  const md = (doc?.metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    md.review_profile,
    md.generation_profile,
    md.template_code,
    doc?.template_code,
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const found = getReviewProfile(c);
      if (found) return found;
    }
  }
  return null;
}

export function renderReviewProfileBlock(profile: ReviewProfile): string {
  return `
==========================================================
TEMPLATE-SPECIFIC REVIEW CHECKLIST
==========================================================
Эти проверки применяются ДОПОЛНИТЕЛЬНО к универсальным проверкам выше.
Они НЕ заменяют universal review и НЕ отменяют его выводы.

REVIEW PROFILE: ${profile.review_profile}
DOCUMENT TYPE:  ${profile.document_type}

ДОПОЛНИТЕЛЬНО ПРОВЕРЬ:
${profile.extra_checks.map((c, i) => `${i + 1}. ${c}`).join("\n")}

НЕ СЧИТАТЬ ОШИБКОЙ:
${profile.do_not_flag.map((c) => `- ${c}`).join("\n")}
==========================================================
`;
}
