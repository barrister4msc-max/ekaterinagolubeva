import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let authRedirectHandled = false;

export interface AuthState {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function absorbAuthRedirectFromUrl() {
      if (typeof window === "undefined" || authRedirectHandled) return;

      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
      const code = url.searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!code && !(accessToken && refreshToken)) return;

      authRedirectHandled = true;
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }

      url.searchParams.delete("code");
      url.searchParams.delete("type");
      url.hash = "";
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    }

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer DB call
        setTimeout(() => checkAdmin(s.user.id), 0);
      } else {
        setIsAdmin(false);
      }
    });

    // Then load existing session
    absorbAuthRedirectFromUrl().finally(() => supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) checkAdmin(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    }));

    async function checkAdmin(uid: string) {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, isAdmin, loading };
}
