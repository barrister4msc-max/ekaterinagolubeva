import { StableJsonError } from "./errors.ts";

function normalize(value: unknown, ancestors: Set<object>, path: string): unknown {
  if (typeof value === "bigint") {
    throw new StableJsonError(`bigint is not supported at ${path}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new StableJsonError(`non-finite number is not supported at ${path}`);
  }
  if (value === null || typeof value !== "object") return value;

  if (ancestors.has(value)) {
    throw new StableJsonError(`circular reference detected at ${path}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => normalize(item, ancestors, `${path}[${index}]`));
    }

    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalize(record[key], ancestors, `${path}.${key}`);
    }
    return sorted;
  } finally {
    ancestors.delete(value);
  }
}

/** Serializes a value with recursively sorted object keys and stable array order. */
export function stableJsonStringify(value: unknown): string {
  const serialized = JSON.stringify(normalize(value, new Set(), "$"));
  if (serialized === undefined) {
    throw new StableJsonError("value cannot be represented as JSON at $");
  }
  return serialized;
}
