import { StableJsonError } from "./errors.ts";

type NormalizedJson =
  | null
  | boolean
  | number
  | string
  | NormalizedJson[]
  | {
      [key: string]: NormalizedJson;
    };

function childPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`;
}

function normalize(value: unknown, path: string, ancestors: WeakSet<object>): NormalizedJson {
  const valueType = typeof value;

  if (value === null || valueType === "string" || valueType === "boolean") {
    return value as null | string | boolean;
  }

  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new StableJsonError("NON_FINITE_NUMBER", path, "Non-finite numbers are not supported");
    }
    return value as number;
  }

  if (valueType !== "object") {
    throw new StableJsonError(
      "UNSUPPORTED_VALUE",
      path,
      `Values of type ${valueType} are not supported`,
    );
  }

  const object = value as object;
  if (ancestors.has(object)) {
    throw new StableJsonError("CIRCULAR_REFERENCE", path, "Circular reference detected");
  }

  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      return object.map((entry, index) => normalize(entry, `${path}[${index}]`, ancestors));
    }

    // A null prototype prevents an own "__proto__" key from invoking a setter.
    const result = Object.create(null) as Record<string, NormalizedJson>;
    for (const key of Object.keys(object).sort()) {
      Object.defineProperty(result, key, {
        value: normalize((object as Record<string, unknown>)[key], childPath(path, key), ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    // Track only the current traversal path so repeated/shared references are valid.
    ancestors.delete(object);
  }
}

/** Serializes a value with recursively sorted object keys and strict JSON values. */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalize(value, "$", new WeakSet<object>()));
}
