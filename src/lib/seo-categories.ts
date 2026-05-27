/**
 * Category mapping for SEO landing pages served by /$slug.
 * Drives breadcrumbs (Главная → Категория → Страница) and the
 * "Смотрите также" internal-linking block (same-category siblings first).
 */

export type SeoCategoryId =
  | "nedvizhimost"
  | "nasledstvo"
  | "arbitrazh"
  | "dogovory"
  | "zemelnoe"
  | "korporativnoe"
  | "semeynoe"
  | "ispolnitelnoe";

export interface SeoCategory {
  id: SeoCategoryId;
  label: string;
  /** Optional landing page for the category. */
  path?: string;
}

export const SEO_CATEGORIES: Record<SeoCategoryId, SeoCategory> = {
  nedvizhimost: { id: "nedvizhimost", label: "Недвижимость", path: "/nedvizhimost" },
  nasledstvo: { id: "nasledstvo", label: "Наследство" },
  arbitrazh: { id: "arbitrazh", label: "Арбитраж", path: "/arbitrazhnye-spory" },
  dogovory: { id: "dogovory", label: "Договоры", path: "/contracts" },
  zemelnoe: { id: "zemelnoe", label: "Земельное право" },
  korporativnoe: { id: "korporativnoe", label: "Корпоративное право" },
  semeynoe: { id: "semeynoe", label: "Семейные споры" },
  ispolnitelnoe: { id: "ispolnitelnoe", label: "Исполнительное производство" },
};

const SLUG_TO_CATEGORY: Record<string, SeoCategoryId> = {
  // Недвижимость
  "proverka-kvartiry-pered-pokupkoy": "nedvizhimost",
  "kvartira-s-arestom": "nedvizhimost",
  "proverka-prodavtsa-kvartiry": "nedvizhimost",
  "kvartira-posle-nasledstva": "nedvizhimost",
  "soprovozhdenie-sdelki-kupli-prodazhi-kvartiry": "nedvizhimost",
  "yuridicheskoe-soprovozhdenie-sdelok-s-nedvizhimostyu": "nedvizhimost",
  "bankrotstvo-s-nedvizhimostyu": "nedvizhimost",
  // Наследство
  "osporit-zaveshchanie": "nasledstvo",
  "nasledstvennyy-yurist-moskva": "nasledstvo",
  // Арбитраж
  "vzyskanie-dolga-po-dogovoru": "arbitrazh",
  "arbitrazhnyy-yurist-moskva": "arbitrazh",
  // Договоры
  "proverka-dogovora": "dogovory",
  "dogovornoe-pravo-moskva": "dogovory",
  // Земельное
  "zemelnoe-pravo-moskva": "zemelnoe",
  // Корпоративное
  "korporativnoe-pravo-moskva": "korporativnoe",
  // Семейные / прочие
  "razdel-kvartiry-pri-razvode": "semeynoe",
  "snyat-arest-so-scheta": "ispolnitelnoe",
};

export function getCategoryForSlug(slug: string): SeoCategory | null {
  const id = SLUG_TO_CATEGORY[slug];
  return id ? SEO_CATEGORIES[id] : null;
}

export function isSameCategory(a: string, b: string): boolean {
  return !!SLUG_TO_CATEGORY[a] && SLUG_TO_CATEGORY[a] === SLUG_TO_CATEGORY[b];
}
