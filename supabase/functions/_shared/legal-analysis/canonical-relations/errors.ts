export type StableJsonErrorCode = "UNSUPPORTED_VALUE" | "NON_FINITE_NUMBER" | "CIRCULAR_REFERENCE";

/** Error raised when a value cannot be represented by stable JSON. */
export class StableJsonError extends Error {
  readonly code: StableJsonErrorCode;
  readonly path: string;

  constructor(code: StableJsonErrorCode, path: string, message: string) {
    super(`${message} at ${path}`);
    this.name = "StableJsonError";
    this.code = code;
    this.path = path;
  }
}
