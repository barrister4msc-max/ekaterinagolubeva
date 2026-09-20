export type SafeProviderFailure = {
  error_code: "provider_http_error" | "provider_exception" | "parse_failed";
  provider: "gemini";
  model?: string;
  http_status?: number;
  response_chars?: number;
};

export function providerHttpFailure(
  model: string,
  httpStatus: number,
  rawResponse: string,
): SafeProviderFailure {
  return {
    error_code: "provider_http_error",
    provider: "gemini",
    model,
    http_status: httpStatus,
    response_chars: rawResponse.length,
  };
}

export function providerException(model: string): SafeProviderFailure {
  return { error_code: "provider_exception", provider: "gemini", model };
}

export function parseFailure(rawResponse: string): SafeProviderFailure {
  return {
    error_code: "parse_failed",
    provider: "gemini",
    response_chars: rawResponse.length,
  };
}

export function safeRuntimeErrorCode(error: unknown): string {
  if (error instanceof Error && error.message === "GEMINI_API_KEY is not set") {
    return "provider_not_configured";
  }
  return "internal_error";
}
