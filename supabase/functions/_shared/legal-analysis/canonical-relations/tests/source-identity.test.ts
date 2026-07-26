import { expect, test } from "bun:test";
import { resolveSourceIdentity } from "../index.ts";

test("resolves an exact source_ref match", () => {
  const source = { source_ref: "law:nk:54.1" };

  expect(resolveSourceIdentity({ sourceId: "law:nk:54.1" }, [source])).toEqual({
    sourceId: "law:nk:54.1",
    source,
  });
});

test("returns undefined when no source_ref matches", () => {
  expect(
    resolveSourceIdentity({ sourceId: "law:missing" }, [{ source_ref: "law:present" }]),
  ).toBeUndefined();
});

test("matches case-sensitively", () => {
  expect(
    resolveSourceIdentity({ sourceId: "law:nk:54.1" }, [{ source_ref: "LAW:NK:54.1" }]),
  ).toBeUndefined();
});

test("does not trim identity values", () => {
  expect(
    resolveSourceIdentity({ sourceId: " law:nk:54.1 " }, [{ source_ref: "law:nk:54.1" }]),
  ).toBeUndefined();
});

test("does not fall back to source_id", () => {
  const source = { source_ref: "law:correct", source_id: "raw-id" };

  expect(resolveSourceIdentity({ sourceId: "raw-id" }, [source])).toBeUndefined();
});

test("does not fall back to title", () => {
  const source = { source_ref: "law:correct", title: "Article 1" };

  expect(resolveSourceIdentity({ sourceId: "Article 1" }, [source])).toBeUndefined();
});

test("does not fall back to url or official_url", () => {
  const source = {
    source_ref: "law:correct",
    url: "https://example.com/url",
    official_url: "https://example.com/official",
  };

  expect(resolveSourceIdentity({ sourceId: source.url }, [source])).toBeUndefined();
  expect(resolveSourceIdentity({ sourceId: source.official_url }, [source])).toBeUndefined();
});

test("does not fall back to bucket or source_type", () => {
  const source = {
    source_ref: "law:correct",
    bucket: "laws",
    source_type: "federal_law",
  };

  expect(resolveSourceIdentity({ sourceId: source.bucket }, [source])).toBeUndefined();
  expect(resolveSourceIdentity({ sourceId: source.source_type }, [source])).toBeUndefined();
});

test("does not use array position as identity", () => {
  expect(resolveSourceIdentity({ sourceId: "0" }, [{ source_ref: "law:first" }])).toBeUndefined();
});

test("returns the first object when source_ref values are duplicated", () => {
  const first = { source_ref: "law:duplicate", source_id: "row-1" };
  const second = { source_ref: "law:duplicate", source_id: "row-2" };

  const result = resolveSourceIdentity({ sourceId: "law:duplicate" }, [first, second]);

  expect(result?.source).toBe(first);
});

test("returns the original source object and preserves additional fields", () => {
  const source = {
    source_ref: "law:1",
    source_id: "row-1",
    title: "Article 1",
  };

  const result = resolveSourceIdentity({ sourceId: "law:1" }, [source]);

  expect(result?.source).toBe(source);
  expect(result?.source.title).toBe("Article 1");
});

test("does not mutate frozen inputs", () => {
  const source = Object.freeze({ source_ref: "law:1", title: "Article 1" });
  const claim = Object.freeze({ sourceId: "law:1" });
  const trustedSources = Object.freeze([source]);

  const result = resolveSourceIdentity(claim, trustedSources);

  expect(result?.source).toBe(source);
  expect(claim.sourceId).toBe("law:1");
  expect(trustedSources[0]).toBe(source);
});

test("returns undefined for an empty trusted source array", () => {
  expect(resolveSourceIdentity({ sourceId: "law:1" }, [])).toBeUndefined();
});
