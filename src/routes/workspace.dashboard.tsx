import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listLeadsFn } from "@/lib/admin-leads.functions";
import { useAuth } from "@/hooks/use-auth";
import { Inbox, AlertCircle, Clock, CheckCircle2, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/workspace/dashboard")({
  component: Dashboard,
});

type Lead = {
  id: string; name: string; phone: string; category: string | null;
  urgency: "low" | "medium" | "high" | null;
  status: "new" | "in_progress" | "waiting" | "closed";
  ai_summary: string | null;
  created_at: string;
};

const URGENCY_LABEL: Record<NonNullable<Lead["urgency"]>, { label: string; cls: string }> = {
  low: { label: "Низкая", cls: "bg-secondary/60 text-foreground/70" },
  medium: { label: "Средняя", cls: "bg-primary/15 text-primary" },
  high: { label: "Высокая", cls: "bg-destructive/10 text-destructive" },
};

function Dashboard() {
  const listLeads = useServerFn(listLeadsFn);
  const { session } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    listLeads({ data: {} }).then((r) => {
      setLeads((r.leads as unknown as Lead[]) ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [session]);

  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const stats = {
    new: leads.filter((l) => l.status === "new").length,
    inProgress: leads.filter((l) => l.status === "in_progress").length,
    high: leads.filter((l) => l.urgency === "high" && l.status !== "closed").length,
    last7d: leads.filter((l) => now - new Date(l.created_at).getTime() < week).length,
  };

  const recent = leads.slice(0, 5);

  return (
    <div className="space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Дашборд</div>
        <h1 className="mt-2 font-display text-4xl">Сегодня</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Спокойный обзор входящих обращений и приоритетов.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Новые" value={stats.new} loading={loading} />
        <StatCard icon={Clock} label="В работе" value={stats.inProgress} loading={loading} />
        <StatCard icon={AlertCircle} label="Срочные" value={stats.high} tone="destructive" loading={loading} />
        <StatCard icon={CheckCircle2} label="За 7 дней" value={stats.last7d} loading={loading} />
      </div>

      <section className="rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)] md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl">Последние обращения</h2>
          <Link to="/workspace/leads" className="text-xs uppercase tracking-[0.18em] text-primary hover:underline">
            Все заявки <ArrowUpRight size={12} className="inline"/>
          </Link>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
        ) : recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Пока нет обращений.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((l) => (
              <li key={l.id} className="grid gap-2 py-4 md:grid-cols-[120px_1fr_auto] md:items-center">
                <div className="text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{l.name} · <span className="text-muted-foreground font-normal">{l.phone}</span></div>
                  {l.ai_summary && (
                    <div className="mt-1 truncate text-sm text-muted-foreground">{l.ai_summary}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {l.urgency && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${URGENCY_LABEL[l.urgency].cls}`}>
                      {URGENCY_LABEL[l.urgency].label}
                    </span>
                  )}
                  {l.category && <span className="text-xs text-muted-foreground">{l.category}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, tone, loading,
}: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number; tone?: "destructive"; loading: boolean }) {
  return (
    <div className="rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">{label}</div>
        <Icon size={16} className={tone === "destructive" ? "text-destructive" : "text-primary"} />
      </div>
      <div className={`mt-3 font-display text-4xl ${tone === "destructive" ? "text-destructive" : ""}`}>
        {loading ? "—" : value}
      </div>
    </div>
  );
}
