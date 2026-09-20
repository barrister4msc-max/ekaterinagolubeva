import type { AiFillPrivacyMode } from "./redaction-safety.ts";

export type AiFillPrivacyDecision = {
  mode: AiFillPrivacyMode;
  code: string;
  purpose: "intake_ai_fill";
  provider_mode: "gemini";
  basis: string;
};

export type AiFillPrivacyScope = {
  authenticated: boolean;
  isAdmin: boolean;
  userId: string;
  serverOriginalOcrEnabled: boolean;
  session: {
    id: string;
    created_by?: string | null;
    matter_id?: string | null;
    client_id?: string | null;
  };
  documents: Array<{
    intake_session_id?: string | null;
    uploaded_by?: string | null;
    matter_id?: string | null;
    client_id?: string | null;
  }>;
};

/**
 * The client never selects this mode.  The caller may request an AI fill, but
 * only the trusted function resolves whether original OCR is permissible.
 * Legacy ownerless rows remain available to the sole administrator, while any
 * present owner, matter, client or session relationship must match exactly.
 */
export function resolveAiFillPrivacyDecision(scope: AiFillPrivacyScope): AiFillPrivacyDecision {
  if (!scope.authenticated) return blocked("unauthenticated");
  if (!scope.isAdmin) return blocked("forbidden");
  if (!scope.session.id || scope.documents.length === 0) return blocked("invalid_scope");

  if (scope.session.created_by && scope.session.created_by !== scope.userId) {
    return blocked("session_owner_mismatch");
  }

  for (const document of scope.documents) {
    if (document.intake_session_id !== scope.session.id) return blocked("document_session_mismatch");
    if (document.uploaded_by && document.uploaded_by !== scope.userId) {
      return blocked("document_owner_mismatch");
    }
    if (
      scope.session.matter_id &&
      document.matter_id &&
      scope.session.matter_id !== document.matter_id
    ) {
      return blocked("document_matter_mismatch");
    }
    if (
      scope.session.client_id &&
      document.client_id &&
      scope.session.client_id !== document.client_id
    ) {
      return blocked("document_client_mismatch");
    }
  }

  if (!scope.serverOriginalOcrEnabled) {
    return {
      mode: "safe",
      code: "redacted_only_by_server_policy",
      purpose: "intake_ai_fill",
      provider_mode: "gemini",
      basis: "server_redacted_only_policy",
    };
  }

  return {
    mode: "original_by_permission",
    code: "original_ocr_allowed",
    purpose: "intake_ai_fill",
    provider_mode: "gemini",
    basis: "authenticated_admin_scoped_session",
  };
}

function blocked(code: string): AiFillPrivacyDecision {
  return {
    mode: "blocked",
    code,
    purpose: "intake_ai_fill",
    provider_mode: "gemini",
    basis: "server_privacy_gate",
  };
}
