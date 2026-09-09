import { describe, expect, test } from "bun:test";
import { approveForWorkingContext } from "./working-context";

describe("approveForWorkingContext", () => {
  test("enables retrieval context without fabricating official verification", () => {
    const approved = approveForWorkingContext(
      {
        official_status: "unverified",
        verification_status: "needs_review",
        source_url: "https://nalog.gov.ru/example",
      },
      "lawyer-1",
      "2026-09-09T12:00:00.000Z",
    );

    expect(approved.official_status).toBe("unverified");
    expect(approved.verification_status).toBe("lawyer_reviewed_working_source");
    expect(approved.working_context_allowed).toBe(true);
    expect(approved.substantive_use_allowed).toBe(false);
    expect(approved.approved_by_lawyer).toBe(true);
  });

  test("does not downgrade independently verified evidence", () => {
    const approved = approveForWorkingContext(
      { official_status: "official", verification_status: "official_verified" },
      "lawyer-1",
      "2026-09-09T12:00:00.000Z",
    );

    expect(approved.official_status).toBe("official");
    expect(approved.verification_status).toBe("official_verified");
    expect(approved.substantive_use_allowed).toBe(false);
  });
});
