import { describe, expect, test } from "bun:test";
import { assertReviewAllowsApproval, evaluateReviewApproval } from "../../src/lib/document-approval";
describe("Prompt 07D approval", () => {
  test("missing pending failed are rejected", () => { expect(evaluateReviewApproval(null).allowed).toBe(false); expect(evaluateReviewApproval({status:"pending",ai_result:{review_status:"passed"}}).allowed).toBe(false); expect(evaluateReviewApproval({status:"failed",ai_result:{review_status:"passed"}}).allowed).toBe(false); });
  test("invalid result is rejected", () => expect(evaluateReviewApproval({status:"completed",ai_result:{}})).toEqual({allowed:false,reason:"review_result_invalid"}));
  test("needs_revision and blocked are rejected", () => { expect(evaluateReviewApproval({status:"completed",ai_result:{review_status:"needs_revision"}}).allowed).toBe(false); expect(evaluateReviewApproval({status:"completed",ai_result:{review_status:"blocked"}}).allowed).toBe(false); });
  test("completed passed is accepted", () => { const run={status:"completed",ai_result:{review_status:"passed",problems:[]},completed_at:"2026-08-29T15:30:00.000Z"}; const documentUpdatedAt="2026-08-29T15:29:00.000Z"; expect(evaluateReviewApproval(run,documentUpdatedAt)).toEqual({allowed:true,reason:null}); expect(() => assertReviewAllowsApproval(run,documentUpdatedAt)).not.toThrow(); });
  test("assertion fails closed", () => expect(() => assertReviewAllowsApproval(null)).toThrow("review_not_completed"));
});
