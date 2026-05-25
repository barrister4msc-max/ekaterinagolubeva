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
    const finishLoading = () => {
      if (mounted) setLoading(false);
    };
    const safetyTimer = window.setTimeout(finishLoading, 3000);

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
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        // Defer DB call
        setTimeout(() => checkAdmin(s.user.id).finally(finishLoading), 0);
      } else {
        setIsAdmin(false);
        finishLoading();
      }
    });

    // Then load existing session
    absorbAuthRedirectFromUrl()
      .then(() => supabase.auth.getSession())
      .then(({ data: { session: s } }) => {
        if (!mounted) return;
        setSession(s);
        if (s?.user) checkAdmin(s.user.id).finally(finishLoading);
        else finishLoading();
      })
      .catch((error) => {
        console.error("auth session check failed", error);
        setSession(null);
        setIsAdmin(false);
        finishLoading();
      });

    async function checkAdmin(uid: string) {
      // Use security-definer RPC to bypass RLS on user_roles
      const { data, error } = await supabase.rpc("is_admin_or_superadmin", {
        _user_id: uid,
      });
      if (error) {
        console.error("admin role check failed", error);
        setIsAdmin(false);
        return;
      }
      setIsAdmin(!!data);
    }

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, isAdmin, loading };
}
