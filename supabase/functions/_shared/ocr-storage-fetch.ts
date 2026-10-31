/** OCR admission must hash origin bytes, not an older CDN object at the same
 * path. cacheNonce is Supabase's documented cache bypass. It is neither a
 * secret nor a content hash and is never returned/logged by this adapter.
 */
export function createFreshOcrStorageFetch(
  baseUrl: string,
  transport: typeof fetch = fetch,
): typeof fetch {
  const base = new URL(baseUrl);
  const prefix = base.pathname.replace(/\/$/, "") + "/storage/v1/object/";
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const object = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^authenticated\//, "")
      : "";
    if (
      method.toUpperCase() !== "GET" ||
      url.origin !== base.origin ||
      !["lead-documents/", "communication-attachments/"].some((bucket) => object.startsWith(bucket))
    )
      return transport(input, init);
    url.searchParams.set("cacheNonce", crypto.randomUUID());
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set("Cache-Control", "no-cache");
    return transport(input instanceof Request ? new Request(url, input) : url, {
      ...init,
      headers,
      cache: "no-store",
    });
  };
}
