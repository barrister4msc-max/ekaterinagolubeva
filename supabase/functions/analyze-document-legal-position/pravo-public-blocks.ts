export type PravoPublicBlocksResponse = unknown;

export type PravoPublicBlocksTransportOptions = {
  baseUrl?: string;
  relayToken?: string | null;
  fetchImpl?: typeof fetch;
};

const DEFAULT_PRAVO_API_BASE = "https://publication.pravo.gov.ru/api";

function resolveBaseUrl(raw?: string): string {
  const candidate = raw?.trim() || DEFAULT_PRAVO_API_BASE;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return DEFAULT_PRAVO_API_BASE;
    return candidate.replace(/\/+$/, "");
  } catch {
    return DEFAULT_PRAVO_API_BASE;
  }
}

/**
 * Fetches the publication blocks through Pravo's documented PublicBlocks API.
 *
 * This transport returns the upstream payload without interpreting it as legal
 * content. Callers must parse and verify the payload, preserve provenance and
 * hash the fetched bytes before creating an OfficialContentObservation.
 */
export async function fetchPravoPublicBlocks(
  eoNumber: string,
  options: PravoPublicBlocksTransportOptions = {},
): Promise<PravoPublicBlocksResponse> {
  const normalized = eoNumber.trim();
  if (!/^\d{16}$/.test(normalized)) {
    throw new Error("Invalid Pravo eoNumber");
  }

  const baseUrl = resolveBaseUrl(options.baseUrl);
  const url = new URL(`${baseUrl}/PublicBlocks`);
  url.searchParams.set("eoNumber", normalized);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.relayToken?.trim()) {
    headers.Authorization = `Bearer ${options.relayToken.trim()}`;
  }

  const response = await (options.fetchImpl ?? fetch)(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Pravo PublicBlocks request failed: HTTP ${response.status}`);
  }

  return await response.json();
}
