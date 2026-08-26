// supabase/functions/extract-document-text/index.ts
// Unified text extraction pipeline for public.documents
// Reads the file from Supabase Storage, extracts plain text per mime/extension,
// then writes ocr_text + metadata.extraction_* fields back to the row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
// @ts-ignore esm.sh JSZip runtime exposes default; declaration omits it
import JSZip from "https://esm.sh/jszip@3.10.1";
import { extractXlsxText } from "../_shared/xlsx-text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";
type ExtractionStatus =
  | "completed"
  | "ocr_required"
  | "failed";

type ExtractionMethod =
  | "docx_xml"
  | "rtf_plain"
  | "txt_utf8"
  | "html_text"
  | "xlsx_xml"
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

function normalizeOcrMimeType(mime: string | null | undefined, fileName: string, storagePath = ""): string {
  const ext = extOf(fileName) || extOf(storagePath);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "pdf") return "application/pdf";
  const m = (mime || "").toLowerCase();
  if (["image/jpeg", "image/png", "image/tiff", "application/pdf"].includes(m)) return m;
  return m && m !== "application/octet-stream" ? m : "application/octet-stream";
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
  zip.forEach((path: string) => {
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
      .replace(/<w:p[ >][^]*?<\/w:p>/g, (p: string) => p + "\n")
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

async function extractXlsx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  return extractXlsxText(zip as unknown as Parameters<typeof extractXlsxText>[0]);
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

async function extractPdfTextLayer(buf: ArrayBuffer): Promise<string> {
  try {
    // @ts-ignore pdfjs legacy build is runtime-compatible with Deno Edge.
    const pdfjs = await import("https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true, useSystemFonts: false });
    const pdf = await loadingTask.promise;
    const pages: string[] = new Array(pdf.numPages).fill("");
    const batchSize = 8;
    for (let start = 1; start <= pdf.numPages; start += batchSize) {
      const pageNumbers = Array.from(
        { length: Math.min(batchSize, pdf.numPages - start + 1) },
        (_, offset) => start + offset,
      );
      await Promise.all(pageNumbers.map(async (pageNumber) => {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages[pageNumber - 1] = (content.items ?? [])
          .map((item: any) => typeof item?.str === "string" ? item.str : "")
          .filter(Boolean)
          .join(" ");
        page.cleanup?.();
      }));
    }
    return pages.join("\\n\\n").replace(/[ \\t]+\\n/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
  } catch (error) {
    console.error("[extract-document-text] PDF text-layer extraction failed", error);
    return "";
  }
}
function sanitizeExtractedText(value: string): string {
  // PostgreSQL text/JSON cannot store NUL. Minimal PDF probes can surface
  // binary control bytes from compressed streams, so strip those before an
  // update and before deciding whether the text layer is usable.
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isUsablePdfTextLayer(value: string): boolean {
  if (value.length < 50) return false;
  const readable = value.match(/[A-Za-zА-Яа-яЁё0-9\s.,:;!?()'"№%+–—/\-]/g)?.length ?? 0;
  const words = value.match(/[A-Za-zА-Яа-яЁё]{2,}/g)?.length ?? 0;
  return readable / value.length >= 0.82 && words >= 10;
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
}): Promise<{ text: string; debug: Record<string, unknown> }> {
  if (!GEMINI_API_KEY) {
  console.error("[extract-document-text] GEMINI_API_KEY is missing");
  return { text: "", debug: { error: "GEMINI_API_KEY missing", model: GEMINI_MODEL, mimeType: params.mimeType, byteLength: params.buf.byteLength } };
}

  const base64 = arrayBufferToBase64(params.buf);

  

  const parts = [
  {
    text:
      "Извлеки весь читаемый текст с изображения/скана. Верни только текст. Если текста нет — верни пустую строку.",
  },
  {
    inline_data: {
      mime_type: params.mimeType,
      data: base64,
    },
  },
];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "[extract-document-text] Gemini fallback failed",
      errorText,
    );
    return { text: "", debug: { error: errorText, model: GEMINI_MODEL, mimeType: params.mimeType, byteLength: params.buf.byteLength } };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  const debug = {
    response_keys: Object.keys(data || {}),
    finishReason: data?.candidates?.[0]?.finishReason,
    candidate_text_length: text.length,
    byteLength: params.buf.byteLength,
    mimeType: params.mimeType,
    model: GEMINI_MODEL,
  };
  console.log("[extract-document-text] Gemini OCR response", JSON.stringify(debug));

  return { text, debug };
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
  if (m.startsWith("image/") || ["png", "jpg", "jpeg", "tif", "tiff", "webp"].includes(e))
    return { method: "image_ocr_required", kind: "image" };
  if (
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    e === "xlsx"
  )
    return { method: "xlsx_xml", kind: "spreadsheet" };
  if (m === "application/vnd.ms-excel" || e === "xls")
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
  supabase: any,
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

async function authorizeRequest(
  req: Request,
  supabase: any,
): Promise<{ ok: true } | { ok: false; status: 401 | 403 }> {
  const authorization = req.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { ok: false, status: 401 };

  // Trusted server-side callers use the exact service-role secret. Browser
  // callers must resolve to a real admin user below.
  if (accessToken === SERVICE_ROLE) return { ok: true };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);
  if (authError || !user) return { ok: false, status: 401 };

  const { data: isAdmin, error: roleError } = await supabase.rpc(
    "is_admin_or_superadmin",
    { _user_id: user.id },
  );
  if (roleError || isAdmin !== true) return { ok: false, status: 403 };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const authorization = await authorizeRequest(req, supabase);
  if (!authorization.ok) {
    return json(
      { error: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      authorization.status,
    );
  }

  let body: { document_id?: string; archive_item_id?: string; storage_path?: string; bucket?: string; mime_type?: string; file_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ---- Archive item mode (lawyer_archive_items) ----
  if (body.archive_item_id) {
    const { data: item, error: loadErr } = await supabase
      .from("lawyer_archive_items")
      .select("id, title, storage_path, metadata")
      .eq("id", body.archive_item_id)
      .maybeSingle();
    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!item) return json({ error: "not_found" }, 404);

    const md = (item.metadata || {}) as Record<string, any>;
    const storagePath = body.storage_path || item.storage_path;
    if (!storagePath) return json({ error: "no_storage_path" }, 400);
    const fileName = body.file_name || md.original_filename || item.title || "document";
    const mime = normalizeOcrMimeType(body.mime_type || md.mime_type, fileName, storagePath);

    let downloaded: { buf: ArrayBuffer; bucket: string } | null = null;
    if (body.bucket) {
      const { data, error } = await supabase.storage.from(body.bucket).download(storagePath);
      if (!error && data) downloaded = { buf: await data.arrayBuffer(), bucket: body.bucket };
    }
    if (!downloaded) downloaded = await downloadFile(supabase, storagePath);
    if (!downloaded) {
      const newMd = { ...md, text_extraction_status: "ocr_failed", ocr_error: "file_not_found_in_storage", ocr_last_attempt_at: new Date().toISOString() };
      await supabase.from("lawyer_archive_items").update({ metadata: newMd }).eq("id", item.id);
      return json({ error: "file_not_found_in_storage" }, 404);
    }
    const byteLength = downloaded.buf.byteLength;
    console.log("[extract-document-text] archive download", JSON.stringify({ archive_item_id: item.id, storagePath, bucket: downloaded.bucket, byteLength, mimeType: mime, fileName }));
    if (byteLength === 0) {
      const newMd = { ...md, text_extraction_status: "ocr_failed", ocr_error: "storage_empty", ocr_debug: { byteLength, mimeType: mime, model: GEMINI_MODEL }, ocr_last_attempt_at: new Date().toISOString() };
      await supabase.from("lawyer_archive_items").update({ metadata: newMd }).eq("id", item.id);
      return json({ ok: false, error: "storage_empty" }, 200);
    }

    const result = await extractWithGeminiFallback({ buf: downloaded.buf, mimeType: mime, fileName });
    const text = result.text.trim();
    if (!text) {
      const unsupportedTiff = mime === "image/tiff" && String(result.debug?.error || "").toLowerCase().includes("unsupported");
      const newMd = {
        ...md,
        text_extraction_status: unsupportedTiff ? "ocr_format_unsupported" : "ocr_failed",
        ocr_error: unsupportedTiff ? "ocr_format_unsupported" : (GEMINI_API_KEY ? "ocr_empty" : "GEMINI_API_KEY missing"),
        ocr_debug: result.debug,
        ocr_last_attempt_at: new Date().toISOString(),
      };
      await supabase.from("lawyer_archive_items").update({ metadata: newMd }).eq("id", item.id);
      return json({ ok: false, error: unsupportedTiff ? "ocr_format_unsupported" : "ocr_empty", ocr_debug: result.debug }, 200);
    }

    const newMd: Record<string, any> = {
      ...md,
      text_extraction_status: "completed",
      text_extraction_method: "gemini_ocr",
      text_extracted_at: new Date().toISOString(),
      extracted_text_length: text.length,
      ocr_text: text,
      ocr_debug: result.debug,
      requires_ocr: false,
    };
    delete newMd.text_extraction_error;
    delete newMd.ocr_error;
    const { error: upErr } = await supabase
      .from("lawyer_archive_items")
      .update({ content: text, metadata: newMd })
      .eq("id", item.id);
    if (upErr) return json({ error: upErr.message }, 500);
    return json({ ok: true, text_length: text.length });
  }

  const documentId = body.document_id;
  if (!documentId) return json({ error: "document_id_required" }, 400);

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
  let extractionError: string | null = null;

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
        text = await extractPdfTextLayer(downloaded.buf);
        break;
      }
      case "image":
        text = "";
        break;
      case "spreadsheet":
        if (method === "xlsx_xml") {
          text = await extractXlsx(downloaded.buf);
          if (!text.trim()) { status = "failed"; extractionError = "spreadsheet_empty"; }
        } else {
          status = "failed"; method = "none"; extractionError = "legacy_xls_extraction_not_supported";
        }
        break;
      default:
        status = "failed";
        method = "none";
        extractionError = "unsupported_format";
    }
    } catch (e) {
    console.error("[extract-document-text] extraction error", e);
    status = "failed";
    extractionError = e instanceof Error ? e.message : "extraction_failed";
    text = "";
  }

  text = sanitizeExtractedText(text);

  const shouldUseGeminiFallback =
    downloaded?.buf &&
    (detected.kind === "image" ||
      (detected.kind === "pdf" && !isUsablePdfTextLayer(text)) ||
      (text.length === 0 && !["spreadsheet", "presentation", "unknown"].includes(detected.kind)));

  if (shouldUseGeminiFallback) {
    const fallback = await extractWithGeminiFallback({
      buf: downloaded.buf,
      mimeType: normalizeOcrMimeType(doc.mime_type, doc.file_name || "document", doc.storage_path),
      fileName: doc.file_name || "document",
    });

    const fallbackText = sanitizeExtractedText(fallback.text);

    if (fallbackText.length > 0) {
      text = fallbackText;
      method = "gemini_fallback";
      status = "completed";
    } else if (detected.kind === "pdf" && isUsablePdfTextLayer(text)) {
      // A short text-layer result is still usable. Do not discard valid
      // embedded text merely because the OCR provider is temporarily unavailable.
      status = "completed";
    } else if (detected.kind === "image" || detected.kind === "pdf") {
      status = "ocr_required";
      text = "";
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
  } else if (textLength > 0) {
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
    extraction_error: extractionError,
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
