import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const BUCKET = "communication-attachments";
const MAX_OBJECTS = 5;
const SAFE_OBJECT_NAME = /^[A-Za-z0-9._-]+\.pdf$/;

type RequestedObject = {
  name: string;
  size_bytes: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function equalSecret(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isRequestedObject(value: unknown): value is RequestedObject {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string"
    && SAFE_OBJECT_NAME.test(item.name)
    && typeof item.size_bytes === "number"
    && Number.isSafeInteger(item.size_bytes)
    && item.size_bytes > 0;
}

function parseRequest(payload: unknown): RequestedObject[] | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (body.bucket !== BUCKET || !Array.isArray(body.objects)) return null;
  if (body.objects.length < 1 || body.objects.length > MAX_OBJECTS) return null;
  if (!body.objects.every(isRequestedObject)) return null;

  const objects = body.objects as RequestedObject[];
  return new Set(objects.map((item) => item.name)).size === objects.length ? objects : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedToken = Deno.env.get("KATI_GUARDED_INTAKE_VERIFY_TOKEN") ?? "";
  const suppliedToken = req.headers.get("x-kati-intake-verifier-token") ?? "";
  if (!expectedToken || !equalSecret(suppliedToken, expectedToken)) {
    return json({ error: "forbidden" }, 403);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }
  const requested = parseRequest(payload);
  if (!requested) return json({ error: "invalid_request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "verifier_unavailable" }, 503);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const verified: RequestedObject[] = [];
  for (const requestedObject of requested) {
    const { data, error } = await client.storage.from(BUCKET).list("", {
      limit: MAX_OBJECTS,
      offset: 0,
      search: requestedObject.name,
    });
    const found = (data ?? []).find((item) => item.name === requestedObject.name);
    const size = typeof found?.metadata?.size === "number"
      ? found.metadata.size
      : Number(found?.metadata?.size);

    if (error || !found || !Number.isSafeInteger(size) || size !== requestedObject.size_bytes) {
      return json({
        error: "storage_preflight_failed",
        object_name: requestedObject.name,
      }, 409);
    }
    verified.push({ name: requestedObject.name, size_bytes: size });
  }

  return json({ verified: true, bucket: BUCKET, objects: verified });
});
