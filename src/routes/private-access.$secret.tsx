import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { redeemPrivateAccessFn } from "@/lib/private-access.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/private-access/$secret")({
  head: () => ({
    meta: [
      { title: "Private access" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrivateAccess,
});

function PrivateAccess() {
  const { secret } = Route.useParams();
  const navigate = useNavigate();
  const redeem = useServerFn(redeemPrivateAccessFn);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const { token_hash } = await redeem({ data: { secret } });
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash,
        });
        if (verifyError) throw verifyError;
        navigate({ to: "/workspace/dashboard", replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "access_denied");
      }
    })();
  }, [secret, redeem, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
      {error ? `Доступ запрещён (${error}).` : "Открываем рабочее пространство…"}
    </main>
  );
}
