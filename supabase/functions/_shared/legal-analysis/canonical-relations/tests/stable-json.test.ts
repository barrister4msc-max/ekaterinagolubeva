import { describe, expect, test } from "bun:test";
import { StableJsonError, stableJsonStringify } from "../index.ts";

describe("stableJsonStringify", () => {
  test("recursively sorts object keys and preserves array order", () => {
    const value = { z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }, 2, 1] };
    expect(stableJsonStringify(value)).toBe('{"a":[{"c":3,"d":4},2,1],"z":{"a":1,"b":2}}');
  });

  test("allows shared references", () => {
    const shared = { b: 2, a: 1 };
    expect(stableJsonStringify({ second: shared, first: shared })).toBe(
      '{"first":{"a":1,"b":2},"second":{"a":1,"b":2}}',
    );
  });

  test("rejects circular references", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => stableJsonStringify(value)).toThrow(StableJsonError);
  });

  test.each([1n, Number.NaN, Infinity, -Infinity])("rejects unsupported number %p", (value) => {
    expect(() => stableJsonStringify(value)).toThrow(StableJsonError);
    expect(() => stableJsonStringify({ value })).toThrow(StableJsonError);
    expect(() => stableJsonStringify([value])).toThrow(StableJsonError);
  });

  test.each([
    ["undefined", undefined],
    ["function", () => undefined],
    ["symbol", Symbol("unsupported")],
  ])("rejects %s at the root and in containers", (_label, value) => {
    expect(() => stableJsonStringify(value)).toThrow(StableJsonError);
    expect(() => stableJsonStringify({ value })).toThrow(StableJsonError);
    expect(() => stableJsonStringify([value])).toThrow(StableJsonError);
  });

  test('preserves "__proto__" as an ordinary own key', () => {
    const value = JSON.parse('{"safe":1,"__proto__":{"polluted":true}}');
    expect(stableJsonStringify(value)).toBe('{"__proto__":{"polluted":true},"safe":1}');
  });

  test("returns the same output on repeated calls", () => {
    const value = { c: 3, a: { z: 1, y: 2 }, b: [3, 2, 1] };
    expect(stableJsonStringify(value)).toBe(stableJsonStringify(value));
  });
});
