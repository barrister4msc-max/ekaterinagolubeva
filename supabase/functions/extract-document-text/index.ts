// supabase/functions/extract-document-text/index.ts
// Unified text extraction pipeline for public.documents
// Reads the file from Supabase Storage, extracts plain text per mime/extension,
// then writes ocr_text + metadata.extraction_* fields back to the row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
type ExtractionStatus =
  | "completed"
  | "ocr_required"
  | "failed";

type ExtractionMethod =
  | "docx_xml"
  | "rtf_plain"
  | "txt_utf8"
  | "html_text"
  | "pdf_text"
  | "pdf_ocr_required"
  | "image_ocr_required"
  | "gemini_fallback"
  | "none";

const BUCKETS = ["lead-documents", "communication-attachments", "hero"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extOf(name: string | null | undefined): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&");
}

async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const collect: string[] = [];
  const files = ["word/document.xml"];
  // include headers/footers/footnotes too if present
  zip.forEach((path) => {
    if (
      /^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path) &&
      !files.includes(path)
    )
      files.push(path);
  });
  for (const f of files) {
    const entry = zip.file(f);
    if (!entry) continue;
    const xml = await entry.async("string");
    // Insert paragraph breaks
    const withBreaks = xml
      .replace(/<w:p[ >][^]*?<\/w:p>/g, (p) => p + "\n")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<w:tab[^>]*\/>/g, "\t");
    // Pull text from <w:t ...>...</w:t>
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(withBreaks)) !== null) {
      collect.push(decodeXmlEntities(m[1]));
    }
    collect.push("\n");
  }
  return collect.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractRtf(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Decode \uNNNN? sequences
  let s = raw.replace(/\\u(-?\d+)\??/g, (_, n) => {
    let code = parseInt(n, 10);
    if (code < 0) code += 65536;
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
  // Decode \'hh hex byte escapes (treat as cp1251 fallback to latin1)
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  // Remove groups like {\*\... } entirely
  s = s.replace(/\{\\\*[^{}]*\}/g, "");
  // Remove RTF control words: \word  or \word123 with optional space
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, " ");
  // Remove remaining braces and backslashes
  s = s.replace(/[{}]/g, "").replace(/\\\\/g, "\\").replace(/\\\n/g, "\n");
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTxt(buf: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buf).trim();
}

function extractHtml(buf: ArrayBuffer): string {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const noScript = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript.replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(text)
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfTextLayer(buf: ArrayBuffer): string {
  // Minimal text-layer probe: try to pull strings from BT...ET blocks.
  // If pdf has no embedded text (scan), this returns < 100 chars and triggers OCR-required.
  const raw = new TextDecoder("latin1").decode(buf);
  const out: string[] = [];
  const btEt = raw.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btEt) {
    const strs = block.match(/\(((?:\\.|[^\\()])*)\)/g) || [];
    for (const s of strs) {
      const inner = s.slice(1, -1).replace(/\\([()\\])/g, "$1");
      out.push(inner);
    }
    const hex = block.match(/<([0-9A-Fa-f\s]+)>/g) || [];
    for (const h of hex) {
      const clean = h.slice(1, -1).replace(/\s+/g, "");
      let txt = "";
      for (let i = 0; i + 1 < clean.length; i += 2) {
        txt += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
      }
      out.push(txt);
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

async function extractWithGeminiFallback(params: {
  buf: ArrayBuffer;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  if (!GEMINI_API_KEY) return "";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Извлеки весь читаемый текст из файла. Верни только plain text, без комментариев и markdown.",
              },
              {
                inlineData: {
                  mimeType: params.mimeType || "application/octet-stream",
                  data: arrayBufferToBase64(params.buf),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "[extract-document-text] Gemini fallback failed",
      await response.text(),
    );
    return "";
  }

  const data = await response.json();

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ""
  );
}
type Detected = {
  method: ExtractionMethod;
  kind:
    | "docx"
    | "rtf"
    | "txt"
    | "html"
    | "pdf"
    | "image"
    | "spreadsheet"
    | "presentation"
    | "unknown";
};

function detect(mime: string, name: string): Detected {
  const m = (mime || "").toLowerCase();
  const e = extOf(name);
  if (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    e === "docx"
  )
    return { method: "docx_xml", kind: "docx" };
  if (m === "application/rtf" || m === "application/msword" || e === "rtf")
    return { method: "rtf_plain", kind: "rtf" };
  if (m === "text/plain" || e === "txt") return { method: "txt_utf8", kind: "txt" };
  if (m === "text/html" || e === "html" || e === "htm")
    return { method: "html_text", kind: "html" };
  if (m === "application/pdf" || e === "pdf") return { method: "pdf_text", kind: "pdf" };
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(e))
    return { method: "image_ocr_required", kind: "image" };
  if (
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ["xls", "xlsx"].includes(e)
  )
    return { method: "none", kind: "spreadsheet" };
  if (
    m === "application/vnd.ms-powerpoint" ||
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ["ppt", "pptx"].includes(e)
  )
    return { method: "none", kind: "presentation" };
  return { method: "none", kind: "unknown" };
}

async function downloadFile(
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<{ buf: ArrayBuffer; bucket: string } | null> {
  // Try known buckets in order; first hit wins.
  for (const bucket of BUCKETS) {
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (!error && data) {
      return { buf: await data.arrayBuffer(), bucket };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { document_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const documentId = body.document_id;
  if (!documentId) return json({ error: "document_id_required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: doc, error: loadErr } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, storage_path, ocr_text, metadata")
    .eq("id", documentId)
    .maybeSingle();
  if (loadErr) return json({ error: loadErr.message }, 500);
  if (!doc) return json({ error: "not_found" }, 404);
  if (!doc.storage_path) return json({ error: "no_storage_path" }, 400);

  const detected = detect(doc.mime_type || "", doc.file_name || "");
  const existingMeta = (doc.metadata || {}) as Record<string, any>;

  

  const downloaded = await downloadFile(supabase, doc.storage_path);
  if (!downloaded) {
    const newMeta = {
      ...existingMeta,
      extraction_status: "failed" as ExtractionStatus,
      extraction_method: "none" as ExtractionMethod,
      extracted_at: new Date().toISOString(),
      text_length: 0,
      extraction_error: "file_not_found_in_storage",
    };
    await supabase
      .from("documents")
      .update({
        analysis_status: "needs_review",
        review_status: "needs_review",
        metadata: newMeta,
      })
      .eq("id", documentId);
    return json({ error: "file_not_found_in_storage" }, 404);
  }

  let text = "";
  let method: ExtractionMethod = detected.method;
  let status: ExtractionStatus = "completed";

  try {
    switch (detected.kind) {
      case "docx":
        text = await extractDocx(downloaded.buf);
        break;
      case "rtf":
        text = extractRtf(downloaded.buf);
        break;
      case "txt":
        text = extractTxt(downloaded.buf);
        break;
      case "html":
        text = extractHtml(downloaded.buf);
        break;
        case "pdf": {
        text = extractPdfTextLayer(downloaded.buf);
        break;
      }
      case "image":
        text = "";
        break;
      default:
        status = "failed";
        method = "none";
    }
    } catch (e) {
    console.error("[extract-document-text] extraction error", e);
    status = "failed";
    text = "";
  }

  if (text.trim().length < 50 && downloaded?.buf) {
    const fallbackText = await extractWithGeminiFallback({
      buf: downloaded.buf,
      mimeType: doc.mime_type || "application/octet-stream",
      fileName: doc.file_name || "document",
    });

    if (fallbackText.trim().length >= 50) {
      text = fallbackText.trim();
      method = "gemini_fallback";
      status = "completed";
    } else if (detected.kind === "image" || detected.kind === "pdf") {
      status = "ocr_required";
      method =
        detected.kind === "image"
          ? "image_ocr_required"
          : "pdf_ocr_required";
    } else {
      status = "failed";
      method = "none";
    }
  }

  const textLength = text.length;

  let analysisStatus: string;
  let reviewStatus: string;
  if (status === "ocr_required") {
    analysisStatus = "needs_review";
    reviewStatus = "ocr_required";
  } else if (status === "failed") {
    analysisStatus = "needs_review";
    reviewStatus = "needs_review";
  } else if (textLength >= 50) {
    analysisStatus = "pending";
    reviewStatus = "not_started";
  } else {
    analysisStatus = "needs_review";
    reviewStatus = "needs_review";
  }

  const newMeta = {
    ...existingMeta,
    extraction_status: status,
    extraction_method: method,
    extracted_at: new Date().toISOString(),
    text_length: textLength,
  };

  const update: Record<string, any> = {
    analysis_status: analysisStatus,
    review_status: reviewStatus,
    metadata: newMeta,
  };
  if (status === "completed" && textLength > 0) {
    update.ocr_text = text;
  }

  const { error: upErr } = await supabase
    .from("documents")
    .update(update)
    .eq("id", documentId);
  if (upErr) return json({ error: upErr.message }, 500);

  return json({
    ok: true,
    extraction_status: status,
    extraction_method: method,
    text_length: textLength,
    analysis_status: analysisStatus,
    review_status: reviewStatus,
  });
});
