// Phase B — ensureMatterAnalysis(sessionId)
// Returns a fresh legal_analysis run + Matter Snapshot, re-running
// analyze-document-legal-position only when the saved run is stale.

import {
  fetchLatestLegalAnalysis,
  runLegalAnalysis,
  type LegalAnalysisRun,
} from "./legal-analysis";
import {
  buildMatterSnapshotFromRun,
  computeSessionSignals,
  type MatterSnapshot,
  type SessionSignals,
} from "./matter-snapshot";

export type StaleReason =
  | "answers_changed"
  | "documents_changed"
  | "sources_changed"
  | "redaction_changed"
  | "ocr_changed"
  | "manual_rerun"
  | "no_analysis";

export type EnsureMatterAnalysisResult = {
  run: LegalAnalysisRun;
  snapshot: MatterSnapshot;
  was_stale: boolean;
  stale_reasons: StaleReason[];
  signals: SessionSignals;
};

export type EnsureMatterAnalysisOptions = {
  forceRerun?: boolean;
};

export function detectStaleReasons(
  run: LegalAnalysisRun | null,
  signals: SessionSignals,
): StaleReason[] {
  if (!run || !run.analysis) return ["no_analysis"];
  const h = run.analysis.hashes;
  if (!h) return ["no_analysis"];
  const reasons: StaleReason[] = [];
  if (h.answers_hash && h.answers_hash !== signals.answers_hash) reasons.push("answers_changed");
  if (h.documents_hash && h.documents_hash !== signals.documents_hash)
    reasons.push("documents_changed");
  if (h.redaction_hash && h.redaction_hash !== signals.redaction_hash)
    reasons.push("redaction_changed");
  if (h.ocr_hash && h.ocr_hash !== signals.ocr_hash) reasons.push("ocr_changed");
  return reasons;
}

export async function ensureMatterAnalysis(
  sessionId: string,
  opts: EnsureMatterAnalysisOptions = {},
): Promise<EnsureMatterAnalysisResult> {
  const [existing, signals] = await Promise.all([
    fetchLatestLegalAnalysis(sessionId),
    computeSessionSignals(sessionId),
  ]);

  let staleReasons: StaleReason[] = opts.forceRerun
    ? ["manual_rerun"]
    : detectStaleReasons(existing, signals);

  let run = existing;
  if (!run || staleReasons.length > 0) {
    run = await runLegalAnalysis(sessionId);
    if (staleReasons.length === 0) staleReasons = ["manual_rerun"];
  }

  if (!run) throw new Error("LEGAL_ANALYSIS_REQUIRED: failed to obtain legal_analysis run");

  return {
    run,
    snapshot: buildMatterSnapshotFromRun(sessionId, run),
    was_stale: staleReasons.length > 0,
    stale_reasons: staleReasons,
    signals,
  };
}
