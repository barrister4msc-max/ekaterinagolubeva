import JSZip from "jszip";

export type ExtractedExternalResearchReference = {
  title: string | null;
  url: string | null;
  citation: string | null;
  document_number: string | null;
  document_date: string | null;
  case_number: string | null;
  code: string | null;
  article: string | null;
};

export type ExternalResearchExtractionResult = {
  text: string;
  references: ExtractedExternalResearchReference[];
  warnings: string[];
};

const MAX_TEXT_CHARS = 120_000;
const MAX_REFERENCES = 20;
const URL_RE = /https?:\/\/[^\s<>()"']+/giu;
const CASE_RE = /(?:^|[^A-Za-zА-Яа-я0-9])([АA]\d{1,3}-\d{2,9}\/\d{4})(?=$|[^A-Za-zА-Яа-я0-9])/giu;
const ARTICLE_RE = /(?:^|[^A-Za-zА-Яа-я0-9])(?:ст\.?|статья)\s*(\d+(?:\.\d+)*)\s*((?:НК|ГК|АПК|ГПК|КоАП|ТК|ЖК|СК|БК|УК)\s*РФ)(?=$|[^A-Za-zА-Яа-я0-9])/giu;
const LETTER_RE = /(?:^|[^A-Za-zА-Яа-я0-9])((?:Письмо|Информация|Разъяснения?)\s+(?:ФНС|Минфина|Министерства\s+финансов)(?:\s+России|\s+РФ)?)\s*(?:от\s*)?(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})?\s*(?:№|N)\s*([A-Za-zА-Яа-я0-9@\-\/\.]+)/giu;
const GENERIC_DOC_RE = /(?:^|[^A-Za-zА-Яа-я0-9])((?:Федеральный\s+закон|Постановление|Определение|Решение|Приказ|Письмо))\s*(?:от\s*)?(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4})?\s*(?:№|N)\s*([A-Za-zА-Яа-я0-9@\-\/\.]+)/giu;

function cleanUrl(value: string): string {
  return value.replace(/[),.;:!?]+$/g, "").slice(0, 2000);
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function referenceKey(ref: ExtractedExternalResearchReference): string {
  return [
    ref.url ?? "",
    ref.document_number ?? "",
    ref.document_date ?? "",
    ref.case_number ?? "",
    ref.code ?? "",
    ref.article ?? "",
    ref.citation ?? "",
  ].join("|").toLowerCase();
}

function addReference(
  target: ExtractedExternalResearchReference[],
  seen: Set<string>,
  reference: ExtractedExternalResearchReference,
) {
  const key = referenceKey(reference);
  if (!key.replace(/\|/g, "")) return;
  if (seen.has(key)) return;
  seen.add(key);
  if (target.length < MAX_REFERENCES) target.push(reference);
}

export function extractExternalResearchReferences(input: string): ExternalResearchExtractionResult {
  const text = String(input ?? "").slice(0, MAX_TEXT_CHARS);
  const references: ExtractedExternalResearchReference[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(LETTER_RE)) {
    const authority = normalizeSpace(match[1] ?? "Письмо");
    const date = normalizeDate(match[2]);
    const number = normalizeSpace(match[3] ?? "");
    addReference(references, seen, {
      title: authority,
      url: null,
      citation: normalizeSpace(`${authority}${date ? ` от ${match[2]}` : ""} № ${number}`),
      document_number: number || null,
      document_date: date,
      case_number: null,
      code: null,
      article: null,
    });
  }

  for (const match of text.matchAll(GENERIC_DOC_RE)) {
    const kind = normalizeSpace(match[1] ?? "Документ");
    const date = normalizeDate(match[2]);
    const number = normalizeSpace(match[3] ?? "");
    addReference(references, seen, {
      title: kind,
      url: null,
      citation: normalizeSpace(`${kind}${match[2] ? ` от ${match[2]}` : ""} № ${number}`),
      document_number: number || null,
      document_date: date,
      case_number: null,
      code: null,
      article: null,
    });
  }

  for (const match of text.matchAll(ARTICLE_RE)) {
    const article = normalizeSpace(match[1] ?? "");
    const code = normalizeSpace(match[2] ?? "");
    addReference(references, seen, {
      title: `${code} ст. ${article}`,
      url: null,
      citation: `${code} ст. ${article}`,
      document_number: null,
      document_date: null,
      case_number: null,
      code: code || null,
      article: article || null,
    });
  }

  for (const match of text.matchAll(CASE_RE)) {
    const caseNumber = normalizeSpace(match[1] ?? "");
    addReference(references, seen, {
      title: `Судебное дело ${caseNumber}`,
      url: null,
      citation: caseNumber,
      document_number: null,
      document_date: null,
      case_number: caseNumber || null,
      code: null,
      article: null,
    });
  }

  for (const match of text.matchAll(URL_RE)) {
    const url = cleanUrl(match[0]);
    addReference(references, seen, {
      title: null,
      url,
      citation: null,
      document_number: null,
      document_date: null,
      case_number: null,
      code: null,
      article: null,
    });
  }

  if (input.length > MAX_TEXT_CHARS) warnings.push("research_text_truncated");
  if (references.length >= MAX_REFERENCES) warnings.push("reference_limit_reached");
  if (references.length === 0 && text.trim()) warnings.push("no_deterministic_references_found");

  return { text, references, warnings };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, " ")
    .replace(/[{}]/g, " ");
}

async function readDocx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) throw new Error("В DOCX не найден word/document.xml");
  const xml = await documentXml.async("text");
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function readExternalResearchFile(file: File): Promise<ExternalResearchExtractionResult> {
  const name = file.name.toLowerCase();
  let text: string;

  if (name.endsWith(".docx")) {
    text = await readDocx(file);
  } else if (name.endsWith(".html") || name.endsWith(".htm")) {
    text = stripHtml(await file.text());
  } else if (name.endsWith(".rtf")) {
    text = stripRtf(await file.text());
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    text = await file.text();
  } else {
    throw new Error("Поддерживаются research-файлы TXT, MD, HTML, RTF и DOCX. PDF/DOC/изображения требуют отдельного безопасного extraction path, чтобы не попадать в Fact Extraction.");
  }

  return extractExternalResearchReferences(text);
}
