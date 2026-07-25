import { describe, expect, test } from "bun:test";
import { StableJsonError } from "../errors.ts";
import { stableJsonStringify } from "../stable-json.ts";

describe("stableJsonStringify", () => {
  test("recursively sorts object keys and preserves array order", () => {
    expect(stableJsonStringify({ z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }, 2, 1] })).toBe(
      '{"a":[{"c":3,"d":4},2,1],"z":{"a":1,"b":2}}',
    );
  });

  test.each([NaN, Infinity, -Infinity])("rejects non-finite number %s", (value) => {
    expect(() => stableJsonStringify({ value })).toThrow(StableJsonError);
  });

  test("rejects bigint", () => {
    expect(() => stableJsonStringify({ value: 1n })).toThrow(StableJsonError);
  });

  test("rejects circular references but permits shared references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => stableJsonStringify(circular)).toThrow(StableJsonError);

    const shared = { b: 2, a: 1 };
    expect(stableJsonStringify({ right: shared, left: shared })).toBe(
      '{"left":{"a":1,"b":2},"right":{"a":1,"b":2}}',
    );
  });
});
