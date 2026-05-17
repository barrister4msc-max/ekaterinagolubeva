import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Вход — Екатерина Голубева" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
      }
      navigate({ to: "/admin" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container-wide flex min-h-[70vh] items-center justify-center py-20">
      <div className="w-full max-w-md">
        <div className="eyebrow mb-4">Админ-панель</div>
        <h1 className="text-3xl md:text-4xl">{mode === "signin" ? "Вход" : "Регистрация"}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Войдите, чтобы управлять портретом hero-секции."
            : "Создайте администратора (первый зарегистрированный получает права admin)."}
        </p>

        <form onSubmit={handle} className="mt-8 space-y-5">
          <label className="block">
            <span className="eyebrow">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="eyebrow">Пароль</span>
            <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border-b border-border bg-transparent py-3 text-base outline-none focus:border-primary" />
          </label>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <button disabled={loading} type="submit" className="btn-primary w-full justify-center">
            {loading ? "..." : mode === "signin" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          {mode === "signin" ? "Создать аккаунт администратора" : "Уже есть аккаунт — войти"}
        </button>

        <div className="mt-10">
          <Link to="/" className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-primary">
            ← На сайт
          </Link>
        </div>
      </div>
    </main>
  );
}
