import { ocrSourceFingerprint } from "./ocr-source-fingerprint.ts";
import { isUsablePdfTextLayer, sanitizeExtractedText } from "./pdf-text-layer.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createOcrControl(config: {
  enabled: boolean;
  ready: boolean;
  client: () => any;
  extractText: (buf: ArrayBuffer) => Promise<string>;
}) {
  return async (req: Request): Promise<Response> => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "unauthorized" }, 401);
    try {
      const client = config.client();
      const { data: auth, error: authError } = await client.auth.getUser(token);
      if (authError || !auth?.user?.id) return json({ error: "unauthorized" }, 401);
      const actor = auth.user.id;
      const { data: admin, error: roleError } = await client.rpc("is_admin_or_superadmin", {
        _user_id: actor,
      });
      if (roleError || admin !== true) return json({ error: "forbidden" }, 403);
      let body: any;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (
        !body ||
        Array.isArray(body) ||
        typeof body !== "object" ||
        Object.keys(body).some((k) => !["action", "session_id", "document_id"].includes(k))
      )
        return json({ error: "invalid_request" }, 400);
      const enabled = config.enabled && config.ready;
      if (body.action === "capability") return json({ server_enabled: enabled });
      if (
        !["enqueue", "status"].includes(body.action) ||
        !uuid.test(body.session_id ?? "") ||
        !uuid.test(body.document_id ?? "")
      )
        return json({ error: "invalid_request" }, 400);
      const args = {
        p_actor_id: actor,
        p_session_id: body.session_id,
        p_document_id: body.document_id,
      };
      const { data: access, error: accessError } = await client.rpc(
        "kati_ocr_document_access",
        args,
      );
      if (accessError) return json({ error: "control_unavailable" }, 503);
      if (access !== true) return json({ error: "forbidden" }, 403);
      let source = null,
        direct: string | null = null;
      if (body.action === "enqueue") {
        if (!enabled) return json({ error: "server_ocr_disabled" }, 503);
        const { data: doc, error } = await client
          .from("documents")
          .select("id,file_name,mime_type,storage_path,metadata")
          .eq("id", body.document_id)
          .maybeSingle();
        if (error || !doc) return json({ error: "document_unavailable" }, 503);
        if (
          doc.mime_type !== "application/pdf" &&
          !String(doc.file_name ?? "")
            .toLowerCase()
            .endsWith(".pdf")
        )
          return json({ error: "not_pdf" }, 422);
        let downloaded: { buf: ArrayBuffer; bucket: string } | null = null;
        for (const bucket of ["lead-documents", "communication-attachments", "hero"]) {
          const { data, error } = await client.storage.from(bucket).download(doc.storage_path);
          if (!error && data) {
            downloaded = { bucket, buf: await data.arrayBuffer() };
            break;
          }
        }
        if (!downloaded) return json({ error: "source_unavailable" }, 503);
        source = await ocrSourceFingerprint(downloaded.buf, downloaded.bucket, doc.storage_path);
        if (doc.metadata?.ocr_execution_owner !== "server") {
          try {
            const text = sanitizeExtractedText(await config.extractText(downloaded.buf));
            if (isUsablePdfTextLayer(text)) direct = text;
          } catch {
            /* Existing scan/corrupt PDF path proceeds to the bounded queue. */
          }
        }
      }
      const { data, error } = await client.rpc("kati_control_document_ocr", {
        ...args,
        p_action: body.action,
        p_source: source,
        p_direct_text: direct,
      });
      if (error || !data) return json({ error: "control_unavailable" }, 503);
      if (data.allowed !== true)
        return json(
          { error: data.code === "forbidden" ? "forbidden" : "document_requires_review" },
          data.code === "forbidden" ? 403 : 409,
        );
      const states = [
        "queued",
        "running",
        "completed",
        "needs_manual_review",
        "paused",
        "not_queued",
      ];
      if (!states.includes(data.state)) return json({ error: "control_unavailable" }, 503);
      // RPC intentionally has no content/path/token fields; keep an explicit
      // response boundary even if its private result grows in a later change.
      const raw = data.progress;
      const progress = raw
        ? {
            totalUnits: Number(raw.totalUnits) || 0,
            completedUnits: Number(raw.completedUnits) || 0,
            failedUnits: Number(raw.failedUnits) || 0,
            pendingUnits: Number(raw.pendingUnits) || 0,
            totalPages: Number(raw.totalPages) || 0,
            indexedPages: Number(raw.indexedPages) || 0,
            percent: Number(raw.percent) || 0,
            complete: raw.complete === true,
          }
        : null;
      return json({
        document_id: body.document_id,
        state: !enabled && ["queued", "running"].includes(data.state) ? "paused" : data.state,
        extraction_status: data.extraction_status,
        text_length: Number(data.text_length) || 0,
        progress,
        server_enabled: enabled,
      });
    } catch {
      return json({ error: "control_unavailable" }, 503);
    }
  };
}
