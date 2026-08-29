import { describe, expect, test } from "bun:test";
import { computeDocumentReadiness } from "../../src/lib/document-readiness";
const consistency = { ready: true, criticalFailed: [], warningsFailed: [], blockReason: null };
describe("Prompt 07D readiness", () => {
  test("missing review is fail-closed", () => { const r=computeDocumentReadiness({consistency,review:null,reviewCompleted:false}); expect(r.status).toBe("NEEDS_REVISION"); expect(r.reasons).toContain("review_not_completed"); });
  test("invalid completed review is fail-closed", () => { const r=computeDocumentReadiness({consistency,review:{},reviewCompleted:true}); expect(r.status).toBe("NEEDS_REVISION"); expect(r.reasons).toContain("review_result_invalid"); });
  test("completed passed review can be ready", () => expect(computeDocumentReadiness({consistency,review:{review_status:"passed",problems:[]},reviewCompleted:true})).toEqual({status:"READY",reasons:[]}));
  test("noncritical findings remain warnings", () => expect(computeDocumentReadiness({consistency,review:{review_status:"passed",problems:[{severity:"high"}]},reviewCompleted:true}).status).toBe("READY_WITH_WARNINGS"));
  test("needs_revision and blocked are preserved", () => { expect(computeDocumentReadiness({consistency,review:{review_status:"needs_revision"},reviewCompleted:true}).status).toBe("NEEDS_REVISION"); expect(computeDocumentReadiness({consistency,review:{review_status:"blocked"},reviewCompleted:true}).status).toBe("BLOCKED"); });
});
