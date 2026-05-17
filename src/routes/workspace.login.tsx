import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Mail, KeyRound, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/workspace/login")({
  head: () => ({
    meta: [
      { title: "Вход в workspace — Екатерина Голубева" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceLogin,
});

function WorkspaceLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/workspace/dashboard" });
  }, [loading, user, navigate]);

  async function sendMagic(e: FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/workspace/dashboard` },
      });
      if (error) throw error;
      setMsg("Письмо отправлено. Откройте его на этом устройстве, чтобы войти.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось отправить письмо");
    } finally {
      setSending(false);
    }
  }

  async function signInPassword(e: FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setSending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/workspace/dashboard" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="container-wide flex min-h-screen items-center justify-center py-16">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border bg-card p-10 shadow-[0_8px_40px_rgba(0,0,0,0.05)]">
          <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Workspace</div>
          <h1 className="mt-2 font-display text-3xl">Вход</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Закрытое рабочее пространство для управления заявками.
          </p>

          {mode === "magic" ? (
            <form onSubmit={sendMagic} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">Email</span>
                <input
                  required type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary"
                  placeholder="you@example.com"
                />
              </label>
              {err && <div className="text-sm text-destructive">{err}</div>}
              {msg && <div className="text-sm text-primary">{msg}</div>}
              <button type="submit" disabled={sending} className="btn-primary w-full justify-center">
                <Mail size={14}/> {sending ? "..." : "Отправить magic-ссылку"}
              </button>
            </form>
          ) : (
            <form onSubmit={signInPassword} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">Email</span>
                <input required type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">Пароль</span>
                <input required type="password" minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
              </label>
              {err && <div className="text-sm text-destructive">{err}</div>}
              <button type="submit" disabled={sending} className="btn-primary w-full justify-center">
                <KeyRound size={14}/> {sending ? "..." : "Войти"}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => { setMode(mode === "magic" ? "password" : "magic"); setErr(null); setMsg(null); }}
            className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-primary"
          >
            {mode === "magic" ? "Войти по паролю" : "Войти по magic-ссылке"}
          </button>
        </div>

        <a href="/" className="mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-primary">
          <ArrowLeft size={12}/> На сайт
        </a>
      </div>
    </main>
  );
}
