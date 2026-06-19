// Server-only text extractors for lawyer_archive_items.
// Loaded dynamically from server-function handlers; never import from client code.

import JSZip from "jszip";

export type ExtractionStatus =
  | "completed"
  | "ocr_required"
  | "failed"
  | "technical_file"
  | "nested_archive";

export type ExtractionResult = {
  status: ExtractionStatus;
  text: string;
  method: string;
  error?: string;
  requires_ocr?: boolean;
  requires_unpack?: boolean;
  document_role?: string;
  use_in_rag?: boolean;
  use_in_generation?: boolean;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function stripXml(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const out: string[] = [];
  const targets = ["word/document.xml"];
  zip.forEach((p) => {
    if (/^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(p)) targets.push(p);
  });
  for (const f of targets) {
    const entry = zip.file(f);
    if (!entry) continue;
    const xml = await entry.async("string");
    const broken = xml
      .replace(/<w:p[ >][^]*?<\/w:p>/g, (p) => p + "\n")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<w:tab[^>]*\/>/g, "\t");
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(broken)) !== null) out.push(decodeXmlEntities(m[1]));
    out.push("\n");
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractRtf(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  let s = raw.replace(/\\u(-?\d+)\??/g, (_, n) => {
    let code = parseInt(n, 10);
    if (code < 0) code += 65536;
    try { return String.fromCodePoint(code); } catch { return ""; }
  });
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\{\\\*[^{}]*\}/g, "");
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, " ");
  s = s.replace(/[{}]/g, "").replace(/\\\\/g, "\\").replace(/\\\n/g, "\n");
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTxt(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buf).trim();
}

function extractHtml(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const noScript = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return decodeXmlEntities(noScript.replace(/<[^>]+>/g, " ")).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractPdfTextLayer(buf: ArrayBuffer): string {
  const raw = new TextDecoder("latin1").decode(buf);
  const out: string[] = [];
  const blocks = raw.match(/BT[\s\S]*?ET/g) || [];
  for (const block of blocks) {
    const strs = block.match(/\(((?:\\.|[^\\()])*)\)/g) || [];
    for (const s of strs) out.push(s.slice(1, -1).replace(/\\([()\\])/g, "$1"));
    const hex = block.match(/<([0-9A-Fa-f\s]+)>/g) || [];
    for (const h of hex) {
      const clean = h.slice(1, -1).replace(/\s+/g, "");
      let t = "";
      for (let i = 0; i + 1 < clean.length; i += 2) t += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
      out.push(t);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

async function extractXlsx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const shared: string[] = [];
  const ssEntry = zip.file("xl/sharedStrings.xml");
  if (ssEntry) {
    const xml = await ssEntry.async("string");
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) shared.push(decodeXmlEntities(m[1]));
  }
  const out: string[] = [];
  const sheetPaths: string[] = [];
  zip.forEach((p) => { if (/^xl\/worksheets\/sheet\d+\.xml$/.test(p)) sheetPaths.push(p); });
  sheetPaths.sort();
  for (const sp of sheetPaths) {
    const entry = zip.file(sp);
    if (!entry) continue;
    const xml = await entry.async("string");
    const cellRe = /<c[^>]*?(?:\s+t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/g;
    let m: RegExpExecArray | null;
    out.push(`# ${sp.replace("xl/worksheets/", "")}`);
    while ((m = cellRe.exec(xml)) !== null) {
      const t = m[1];
      const inner = m[2];
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
      if (t === "s" && vMatch) {
        const idx = parseInt(vMatch[1], 10);
        if (!isNaN(idx) && shared[idx]) out.push(shared[idx]);
      } else if (t === "inlineStr" && isMatch) {
        out.push(stripXml(isMatch[1]));
      } else if (vMatch) {
        out.push(vMatch[1]);
      }
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractPptx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides: string[] = [];
  zip.forEach((p) => { if (/^ppt\/slides\/slide\d+\.xml$/.test(p)) slides.push(p); });
  slides.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)/)![1], 10);
    const nb = parseInt(b.match(/slide(\d+)/)![1], 10);
    return na - nb;
  });
  const out: string[] = [];
  for (const sp of slides) {
    const entry = zip.file(sp);
    if (!entry) continue;
    const xml = await entry.async("string");
    out.push(`# ${sp.replace("ppt/slides/", "")}`);
    const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) out.push(decodeXmlEntities(m[1]));
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const BUCKETS = ["lead-documents", "communication-attachments", "hero"];

export async function downloadArchiveFile(
  admin: any,
  storagePath: string,
): Promise<{ buf: ArrayBuffer; bucket: string } | null> {
  for (const bucket of BUCKETS) {
    const { data, error } = await admin.storage.from(bucket).download(storagePath);
    if (!error && data) return { buf: await data.arrayBuffer(), bucket };
  }
  return null;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export async function extractByExtension(
  ext: string,
  buf: ArrayBuffer,
): Promise<ExtractionResult> {
  const e = ext.toLowerCase();
  try {
    if (e === "docx") return { status: "completed", method: "docx_xml", text: await extractDocx(buf) };
    if (e === "rtf") return { status: "completed", method: "rtf_plain", text: extractRtf(buf) };
    if (e === "txt" || e === "json" || e === "csv") return { status: "completed", method: `${e}_utf8`, text: extractTxt(buf) };
    if (e === "xml") return { status: "completed", method: "xml_text", text: stripXml(extractTxt(buf)) };
    if (e === "html" || e === "htm") return { status: "completed", method: "html_text", text: extractHtml(buf) };
    if (e === "pdf") {
      const t = extractPdfTextLayer(buf);
      if (t.length >= 80) return { status: "completed", method: "pdf_text", text: t };
      return { status: "ocr_required", method: "pdf_ocr_required", text: "", requires_ocr: true };
    }
    if (["jpg", "jpeg", "png", "tif", "tiff", "webp", "gif", "bmp", "heic"].includes(e)) {
      return { status: "ocr_required", method: "image_ocr_required", text: "", requires_ocr: true };
    }
    if (["p7s", "sig", "pem", "crt"].includes(e)) {
      return {
        status: "technical_file",
        method: "technical_signature",
        text: "",
        document_role: "technical",
        use_in_rag: false,
        use_in_generation: false,
      };
    }
    if (["zip", "7z", "rar"].includes(e)) {
      return {
        status: "nested_archive",
        method: "nested_archive",
        text: "",
        requires_unpack: true,
        use_in_rag: false,
      };
    }
    if (e === "xls" || e === "xlsx") return { status: "completed", method: "xlsx_xml", text: await extractXlsx(buf) };
    if (e === "ppt" || e === "pptx") return { status: "completed", method: "pptx_xml", text: await extractPptx(buf) };
    return { status: "failed", method: "unknown_ext", text: "", error: `unsupported_extension:${e}` };
  } catch (err: any) {
    return { status: "failed", method: "exception", text: "", error: err?.message ?? String(err) };
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export async function ocrViaGemini(
  buf: ArrayBuffer,
  mimeType: string,
): Promise<{ text: string; error?: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { text: "", error: "GEMINI_API_KEY missing" };
  try {
    const base64 = arrayBufferToBase64(buf);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Извлеки весь читаемый текст из файла. Верни только plain text, без markdown и комментариев." },
              { inline_data: { mime_type: mimeType || "application/octet-stream", data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { text: "", error: `gemini_http_${resp.status}: ${body.slice(0, 200)}` };
    }
    const j: any = await resp.json();
    return { text: (j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim() };
  } catch (e: any) {
    return { text: "", error: e?.message ?? String(e) };
  }
}
