import { describe, expect, test } from "bun:test";
import { normalizeTemporalDate } from "./temporal-date.ts";

describe("temporal date normalization", () => {
  test("keeps ISO dates", () => {
    expect(normalizeTemporalDate("2022-03-01")).toBe("2022-03-01");
    expect(normalizeTemporalDate("2022-03-01T10:15:00Z")).toBe("2022-03-01");
  });

  test("normalizes common Russian numeric formats", () => {
    expect(normalizeTemporalDate("01.03.2022")).toBe("2022-03-01");
    expect(normalizeTemporalDate("1/3/2022")).toBe("2022-03-01");
    expect(normalizeTemporalDate("01-03-2022")).toBe("2022-03-01");
  });

  test("rejects impossible or ambiguous values instead of guessing", () => {
    expect(normalizeTemporalDate("31.02.2022")).toBeNull();
    expect(normalizeTemporalDate("март 2022")).toBeNull();
    expect(normalizeTemporalDate(20220301)).toBeNull();
  });
});
