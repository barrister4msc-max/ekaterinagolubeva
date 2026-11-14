/** Hosted Edge injects a named default secret on newer projects. */
export function readSupabaseServerKey(getEnv: (name: string) => string | undefined): string {
  const configured = getEnv("SUPABASE_SECRET_KEYS");
  if (configured) {
    try {
      const keys = JSON.parse(configured);
      const key = keys?.default;
      if (typeof key === "string" && key.startsWith("sb_secret_") && key.length > 10) {
        return key;
      }
    } catch {
      // Older environments can still supply the legacy service role key.
    }
  }
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
