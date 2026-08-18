import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authorizeRequest(
  req: Request,
  supabase: any,
): Promise<{ ok: true } | { ok: false; status: 401 | 403 }> {
  const authorization = req.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { ok: false, status: 401 };
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

function normalizeMime(mime: unknown, fileName: unknown): string {
  const input = typeof mime === "string" ? mime.toLowerCase().trim() : "";
  const name = typeof fileName === "string" ? fileName.toLowerCase() : "";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return input;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/^data:[^;]+;base64,/i, "").trim();
    if (!normalized || normalized.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 16) return null;
    const binary = atob(normalized);
    if (binary.length === 0 || binary.length > MAX_FILE_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function sanitizeText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function extractWithGemini(params: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<{ text: string; finishReason: string | null }> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  let binary = "";
  for (let i = 0; i < params.bytes.length; i += 1) {
    binary += String.fromCharCode(params.bytes[i]);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: "Извлеки весь читаемый текст из этого research-файла. Верни только текст без анализа, выводов, пересказа и добавления фактов. Если текста нет — верни пустую строку.",
            },
            {
              inline_data: {
                mime_type: params.mimeType,
                data: btoa(binary),
              },
            },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Gemini extraction failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  return {
    text: sanitizeText(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""),
    finishReason: data?.candidates?.[0]?.finishReason ?? null,
  };
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

  let body: {
    file_name?: string;
    mime_type?: string;
    file_base64?: string;
    purpose?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.purpose !== "external_legal_research") {
    return json({ error: "invalid_purpose" }, 400);
  }

  const fileName = String(body.file_name ?? "research-file").slice(0, 300);
  const mimeType = normalizeMime(body.mime_type, fileName);
  if (!SUPPORTED_MIME.has(mimeType)) {
    const legacyDoc = fileName.toLowerCase().endsWith(".doc") || mimeType === "application/msword";
    return json({
      error: legacyDoc ? "unsupported_legacy_doc" : "unsupported_format",
      supported: ["pdf", "jpg", "jpeg", "png", "webp"],
    }, 400);
  }

  if (typeof body.file_base64 !== "string") {
    return json({ error: "file_base64_required" }, 400);
  }
  const bytes = decodeBase64(body.file_base64);
  if (!bytes) return json({ error: "invalid_or_oversize_file", max_bytes: MAX_FILE_BYTES }, 400);

  try {
    const extracted = await extractWithGemini({ bytes, mimeType, fileName });
    return json({
      ok: true,
      purpose: "external_legal_research",
      extraction_method: "gemini_ocr",
      text: extracted.text,
      text_length: extracted.text.length,
      finish_reason: extracted.finishReason,
      persisted: false,
      fact_extraction_eligible: false,
    });
  } catch (error) {
    console.error("[extract-external-research-text] extraction failed", error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "extraction_failed",
      persisted: false,
      fact_extraction_eligible: false,
    }, 502);
  }
});
