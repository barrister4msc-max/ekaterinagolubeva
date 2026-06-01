import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

let authRedirectHandled = false;
const AUTH_REQUEST_TIMEOUT_MS = 2500;

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

    function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
      return Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => {
          window.setTimeout(() => reject(new Error(`${label} timed out`)), AUTH_REQUEST_TIMEOUT_MS);
        }),
      ]);
    }

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
        await withTimeout(supabase.auth.exchangeCodeForSession(code), "auth code exchange");
      } else if (accessToken && refreshToken) {
        await withTimeout(
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
          "auth token restore",
        );
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
      .then(() => withTimeout(supabase.auth.getSession(), "auth session check"))
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
      try {
        const { data, error } = await withTimeout(
          supabase.rpc("is_admin_or_superadmin", { _user_id: uid }),
          "admin role check",
        );
        if (error) {
          console.error("admin role check failed", error);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(!!data);
      } catch (error) {
        console.error("admin role check failed", error);
        setIsAdmin(false);
      }
    }

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, isAdmin, loading };
}
