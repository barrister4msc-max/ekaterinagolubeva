import type { FullCorpusDocument } from "./full-corpus-admission.ts";
export class OcrSourceAdmissionError extends Error {
  constructor(
    public readonly code:
      | "ocr_source_changed"
      | "ocr_source_verification_unavailable" = "ocr_source_changed",
  ) {
    super(code);
    this.name = "OcrSourceAdmissionError";
  }
}
const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function ocrConsumerSource(document: FullCorpusDocument) {
  const meta = record(document.metadata);
  return {
    id: document.id,
    managed: meta.ocr_execution_owner === "server" || Object.hasOwn(meta, "ocr_source_fingerprint"),
    source: meta.ocr_source_fingerprint ?? null,
  };
}
type Client = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: unknown }>;
};
/** Request-local, no global fetch mutation or flags/caller bypass. Legacy-only
 * packets keep their old route; managed packets require the private RPC even
 * when server flags are rolled back. Expected pins are immutable snapshots.
 */
export function createOcrConsumerAdmission(
  client: Client,
  actorId: string,
  sessionId: string | null,
  documents: readonly FullCorpusDocument[],
) {
  const snapshots = JSON.parse(
    JSON.stringify(
      documents.map((document) => {
        const meta = record(document.metadata),
          redacted = meta.redaction_status === "accepted" && typeof meta.redacted_text === "string";
        return {
          ...ocrConsumerSource(document),
          extraction_status: meta.extraction_status ?? null,
          page_index_progress: meta.page_index_progress ?? null,
          representation_version: redacted ? "accepted_redaction_v1" : "ocr_text_v1",
          representation: redacted ? meta.redacted_text : (document.ocr_text ?? ""),
        };
      }),
    ),
  );
  const managed = snapshots.some((d: any) => d.managed);
  const expected = managed
    ? Promise.all(
        snapshots.map(async (entry: any) => {
          const { representation, ...identity } = entry;
          const hash = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(representation),
          );
          return {
            ...identity,
            representation_sha256: Array.from(new Uint8Array(hash), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join(""),
          };
        }),
      )
    : Promise.resolve([]);
  const check = async () => {
    if (!managed) return;
    if (!sessionId) throw new OcrSourceAdmissionError();
    try {
      const { data, error } = await client.rpc("kati_check_ocr_consumer_sources", {
        p_actor_id: actorId,
        p_session_id: sessionId,
        p_expected: await expected,
      });
      if (error || !data || typeof data.allowed !== "boolean")
        throw new OcrSourceAdmissionError("ocr_source_verification_unavailable");
      if (data.allowed !== true) throw new OcrSourceAdmissionError();
    } catch (error) {
      if (error instanceof OcrSourceAdmissionError) throw error;
      throw new OcrSourceAdmissionError("ocr_source_verification_unavailable");
    }
  };
  return {
    managed,
    check,
    fetch:
      (transport: typeof fetch = fetch): typeof fetch =>
      async (input, init) => {
        await check();
        return transport(input, init);
      },
  };
}
