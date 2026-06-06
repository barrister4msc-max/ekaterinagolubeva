// Recommendation helper — maps a missing/unverified source to an official
// trusted domain + deeplink for manual review. No automatic fetching.

export type Trust = "high" | "medium" | "low" | "unknown";

export type Recommendation = {
  domain: string;
  url: string;
  trust: Trust;
  authority: string;
  reason: string;
};

export const TRUSTED_HIGH = [
  "pravo.gov.ru",
  "publication.pravo.gov.ru",
  "nalog.gov.ru",
  "minfin.gov.ru",
  "vsrf.ru",
  "sudrf.ru",
  "kad.arbitr.ru",
  "cbr.ru",
  "government.ru",
  "kremlin.ru",
  "rosreestr.gov.ru",
  "fas.gov.ru",
];
export const TRUSTED_MEDIUM = ["consultant.ru", "garant.ru"];

export function trustLevelOfUrl(url: string | null | undefined): Trust {
  if (!url) return "unknown";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (TRUSTED_HIGH.some((d) => host === d || host.endsWith("." + d))) return "high";
    if (TRUSTED_MEDIUM.some((d) => host === d || host.endsWith("." + d))) return "medium";
    return "low";
  } catch {
    return "unknown";
  }
}

const re = (s: string) => encodeURIComponent(s);

export function recommendSourceFor(input: {
  type?: string | null;
  title?: string | null;
  article?: string | null;
  document_number?: string | null;
  text?: string | null;
}): Recommendation {
  const t = (input.type || "").toLowerCase();
  const blob = `${input.title ?? ""} ${input.article ?? ""} ${input.document_number ?? ""} ${input.text ?? ""}`.toLowerCase();
  const query = (input.title || input.article || input.document_number || input.text || "").trim();
  const q = re(query);

  // FNS / tax letter
  if (t.includes("fns") || /письм[оа].*\bфнс\b|\bфнс\b.*письм/.test(blob)) {
    return {
      domain: "nalog.gov.ru",
      url: `https://www.nalog.gov.ru/search/?q=${q}`,
      trust: "high",
      authority: "ФНС России",
      reason: "Официальный сайт ФНС России — публикация писем и разъяснений",
    };
  }
  // Minfin letter
  if (t.includes("minfin") || /минфин/.test(blob)) {
    return {
      domain: "minfin.gov.ru",
      url: `https://minfin.gov.ru/ru/search/?q_4=${q}`,
      trust: "high",
      authority: "Минфин России",
      reason: "Официальный сайт Минфина — письма и разъяснения",
    };
  }
  // Supreme Court reviews / practice
  if (t.includes("vs_review") || /\bвс рф\b|верховн[а-я]+ суд|обзор судебной/.test(blob)) {
    return {
      domain: "vsrf.ru",
      url: `https://vsrf.ru/search.php?searchf=${q}`,
      trust: "high",
      authority: "Верховный Суд РФ",
      reason: "Официальный сайт ВС РФ — обзоры и постановления Пленума",
    };
  }
  // Arbitrazh practice
  if (t.includes("court") || /арбитраж|апк|кад\.arbitr/.test(blob)) {
    return {
      domain: "kad.arbitr.ru",
      url: `https://kad.arbitr.ru/Kad/SearchInstances`,
      trust: "high",
      authority: "Картотека арбитражных дел",
      reason: "Картотека арбитражных дел — поиск по номеру/сторонам",
    };
  }
  // Court of general jurisdiction
  if (/районный суд|городской суд|мировой судья|гпк/.test(blob)) {
    return {
      domain: "sudrf.ru",
      url: `https://sudrf.ru/index.php?id=300&searchtext=${q}`,
      trust: "high",
      authority: "ГАС «Правосудие»",
      reason: "Поиск судебных актов СОЮ",
    };
  }
  // Rosreestr
  if (/росреестр|егрн|кадастр/.test(blob)) {
    return {
      domain: "rosreestr.gov.ru",
      url: `https://rosreestr.gov.ru/`,
      trust: "high",
      authority: "Росреестр",
      reason: "Официальный портал Росреестра",
    };
  }
  // CBR
  if (/\bцб рф\b|банк россии|цбр/.test(blob)) {
    return {
      domain: "cbr.ru",
      url: `https://www.cbr.ru/search/?text=${q}`,
      trust: "high",
      authority: "Банк России",
      reason: "Официальный сайт Банка России",
    };
  }
  // Codex / federal law / regulation — default to pravo.gov.ru
  return {
    domain: "pravo.gov.ru",
    url: `http://publication.pravo.gov.ru/search?q=${q}`,
    trust: "high",
    authority: "Официальный портал правовой информации",
    reason: "Государственный реестр нормативно-правовых актов РФ",
  };
}
