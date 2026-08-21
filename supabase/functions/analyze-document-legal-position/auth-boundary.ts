export type AnalyzerAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: "Unauthorized" | "Forbidden" };

type AnalyzerAuthClient = {
  auth: {
    getUser: (accessToken: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  rpc: (
    fn: "is_admin_or_superadmin",
    args: { _user_id: string },
  ) => Promise<{ data: boolean | null; error: unknown }>;
};

export async function authorizeAnalyzerRequest(
  req: Request,
  sb: AnalyzerAuthClient,
): Promise<AnalyzerAuthResult> {
  const authorization = req.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!accessToken) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser(accessToken);

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: isAdmin, error: roleError } = await sb.rpc("is_admin_or_superadmin", {
    _user_id: user.id,
  });

  if (roleError || isAdmin !== true) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, userId: user.id };
}
