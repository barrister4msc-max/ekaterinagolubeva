export type OcrProgress = {
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  pendingUnits: number;
  totalPages: number;
  indexedPages: number;
  percent: number;
  complete: boolean;
};
export type ServerOcrState =
  | "queued"
  | "running"
  | "completed"
  | "needs_manual_review"
  | "paused"
  | "not_queued";
export type ServerOcrStatus = {
  document_id: string;
  state: ServerOcrState;
  extraction_status: string;
  text_length: number;
  progress: OcrProgress | null;
  server_enabled: boolean;
};
export type ExtractionOutcome = {
  extractionStatus: string;
  textLength: number;
  attempts: number;
  error?: string;
  serverQueued?: boolean;
};
type DocumentRoute = {
  id: string;
  file_name?: string | null;
  mime_type?: string | null;
  server_ocr_owned?: boolean;
};
type Client = {
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> },
    ): PromiseLike<{ data: any; error: any }>;
  };
};
export function usesServerOcr(doc: DocumentRoute, enabled: boolean) {
  return Boolean(
    doc.server_ocr_owned ||
    (enabled &&
      (doc.mime_type === "application/pdf" || doc.file_name?.toLowerCase().endsWith(".pdf"))),
  );
}
export async function readServerOcr(
  client: Client,
  action: "enqueue" | "status",
  sessionId: string,
  documentId: string,
): Promise<ServerOcrStatus> {
  const { data, error } = await client.functions.invoke("document-ocr-control", {
    body: { action, session_id: sessionId, document_id: documentId },
  });
  if (
    error ||
    !data ||
    data.document_id !== documentId ||
    !["queued", "running", "completed", "needs_manual_review", "paused", "not_queued"].includes(
      data.state,
    )
  )
    throw new Error("server_ocr_unavailable");
  return data as ServerOcrStatus;
}
export async function extractByOwnership(
  doc: DocumentRoute,
  options: {
    enabled: boolean;
    sessionId: string | null;
    client: Client;
    legacy: () => Promise<ExtractionOutcome>;
  },
): Promise<ExtractionOutcome> {
  if (!usesServerOcr(doc, options.enabled)) return options.legacy();
  if (!options.sessionId)
    return {
      extractionStatus: "failed",
      textLength: 0,
      attempts: 0,
      error: "Документ сохранён. Не удалось проверить доступ к обработке.",
    };
  try {
    const result = await readServerOcr(
      options.client,
      doc.server_ocr_owned ? "status" : "enqueue",
      options.sessionId,
      doc.id,
    );
    if (result.state === "completed")
      return { extractionStatus: "completed", textLength: result.text_length, attempts: 0 };
    if (["queued", "running", "paused"].includes(result.state))
      return { extractionStatus: "pending", textLength: 0, attempts: 0, serverQueued: true };
    return {
      extractionStatus: "needs_manual_review",
      textLength: 0,
      attempts: 0,
      error: "Документ сохранён. Нужна проверка перед продолжением обработки.",
    };
  } catch {
    // No fallback to client-driven OCR after a server error/response timeout.
    return {
      extractionStatus: "failed",
      textLength: 0,
      attempts: 0,
      error: "Документ сохранён. Обработка временно недоступна — попробуй проверить статус позже.",
    };
  }
}
export function serverOcrLabel(state?: ServerOcrState) {
  return state === "paused"
    ? "Обработка приостановлена"
    : state === "running"
      ? "Обрабатывается"
      : state === "needs_manual_review"
        ? "Нужна ручная проверка"
        : state === "completed"
          ? "Готов"
          : "В очереди";
}
