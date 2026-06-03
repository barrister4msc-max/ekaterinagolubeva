import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Inbox, BarChart3, Settings, LogOut, ArrowLeft, MessageSquareQuote, KanbanSquare, Building2 } from "lucide-react";
import workspaceBg from "@/assets/workspace-bg.png.asset.json";

const bgStyle: React.CSSProperties = {
  backgroundImage: `url(${workspaceBg.url})`,
  backgroundSize: "cover",
  backgroundPosition: "center top",
  backgroundRepeat: "no-repeat",
};

const bgOverlayStyle: React.CSSProperties = {
  background:
    "linear-gradient(115deg, oklch(0.18 0.018 70 / 0.50) 0%, oklch(0.96 0.012 75 / 0.22) 42%, oklch(0.12 0.018 215 / 0.62) 100%)",
};

function WorkspaceBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent">
      <div aria-hidden="true" className="fixed inset-0 z-0" style={bgStyle} />
      <div aria-hidden="true" className="fixed inset-0 z-0" style={bgOverlayStyle} />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Екатерина Голубева" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceLayout,
});

const nav = [
  { to: "/workspace/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { to: "/workspace/leads", label: "Заявки", icon: Inbox },
  { to: "/workspace/crm", label: "CRM", icon: KanbanSquare },
  { to: "/workspace/ai-podbor", label: "AI-подбор", icon: Building2 },
  { to: "/workspace/reviews", label: "Отзывы", icon: MessageSquareQuote },
  { to: "/workspace/statistics", label: "Статистика", icon: BarChart3 },
  { to: "/workspace/settings", label: "Настройки", icon: Settings },
] as const;

function WorkspaceLayout() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoginRoute = location.pathname === "/workspace/login";

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginRoute) navigate({ to: "/workspace/login" });
  }, [loading, user, isLoginRoute, navigate]);

  if (isLoginRoute) {
    return (
      <WorkspaceBackground>
        <Outlet />
      </WorkspaceBackground>
    );
  }

  if (loading || !user) {
    return (
      <WorkspaceBackground>
        <main className="min-h-screen py-32 text-center text-sm text-muted-foreground">
          Загрузка…
        </main>
      </WorkspaceBackground>
    );
  }

  if (!isAdmin) {
    return (
      <WorkspaceBackground>
        <main className="container-wide min-h-screen py-32">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card/70 p-10 text-center shadow-[0_4px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm">
            <h1 className="font-display text-2xl">Доступ ограничен</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Этот аккаунт не имеет роли admin.
            </p>
            <button
              onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/workspace/login" }))}
              className="btn-ghost mx-auto mt-6"
            >
              <LogOut size={14}/> Выйти
            </button>
          </div>
        </main>
      </WorkspaceBackground>
    );
  }

  return (
    <WorkspaceBackground>
      <div className="container-wide flex min-h-screen flex-col gap-8 py-8 md:flex-row md:gap-10 md:py-10">
        {/* Side rail */}
        <aside className="md:w-60 md:shrink-0">
          <div className="rounded-lg border border-border/80 bg-card/92 p-5 shadow-[0_18px_60px_rgba(47,41,37,0.14)] backdrop-blur-xl md:sticky md:top-8">
            <Link to="/" className="block">
              <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Workspace</div>
              <div className="mt-1 font-display text-lg leading-tight">Екатерина Голубева</div>
            </Link>
            <nav className="mt-6 flex flex-col gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/75 transition-colors hover:bg-secondary/50 hover:text-foreground"
                  activeProps={{ className: "bg-secondary/70 text-foreground font-medium" }}
                >
                  <n.icon size={15} />
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 border-t border-border/60 pt-4">
              <a href="/" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-primary">
                <ArrowLeft size={12}/> На сайт
              </a>
              <button
                onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/workspace/login" }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-destructive"
              >
                <LogOut size={12}/> Выйти
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </WorkspaceBackground>
  );
}
