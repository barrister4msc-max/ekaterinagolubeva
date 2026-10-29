/** Service-only IO adapter. Never fall back to unreserved provider calls. */
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
type Lease = { job_id: string; lease_token: string | null };

export function reservedOcrAttempts(supabase: RpcClient, documentId: string, job: Lease) {
  return {
    async reserve(unit: { start: number; end: number; pageCount: number }): Promise<string> {
      const { data, error } = await supabase.rpc("kati_reserve_document_ocr_unit", {
        p_document_id: documentId, p_job_id: job.job_id, p_lease_token: job.lease_token,
        p_page_count: unit.pageCount, p_unit_start: unit.start, p_unit_end: unit.end,
      });
      const result = data as { allowed?: boolean; reservation_id?: string } | null;
      if (error || result?.allowed !== true || typeof result.reservation_id !== "string" || !result.reservation_id)
        throw new Error("ocr_reservation_denied");
      return result.reservation_id;
    },
    async settle(start: number, reservation: string, result: { text: string } | { error: string }) {
      const { data, error } = await supabase.rpc("kati_settle_document_ocr_unit", {
        p_document_id: documentId, p_job_id: job.job_id, p_lease_token: job.lease_token,
        p_unit_start: start, p_reservation_id: reservation,
        p_text: "text" in result ? result.text : null,
        p_error_code: "error" in result ? "ocr_unit_failed" : null,
      });
      if (error || data !== true) throw new Error("ocr_settlement_rejected");
    },
  };
}
