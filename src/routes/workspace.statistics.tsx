import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listLeadsFn } from "@/lib/admin-leads.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/workspace/statistics")({
  component: Statistics,
});

type Lead = {
  id: string;
  category: string | null;
  urgency: "low" | "medium" | "high" | null;
  status: "new" | "in_progress" | "waiting" | "closed";
  created_at: string;
};

const STATUS_LABEL: Record<Lead["status"], string> = {
  new: "Новые", in_progress: "В работе", waiting: "Ожидание", closed: "Закрыты",
};
const URGENCY_LABEL = { low: "Низкая", medium: "Средняя", high: "Высокая" } as const;

function Statistics() {
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

  const byCategory = useMemo(() => groupCount(leads, (l) => l.category ?? "—"), [leads]);
  const byStatus = useMemo(() => groupCount(leads, (l) => STATUS_LABEL[l.status]), [leads]);
  const byUrgency = useMemo(() => groupCount(leads, (l) => (l.urgency ? URGENCY_LABEL[l.urgency] : "—")), [leads]);

  const byDay = useMemo(() => {
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    leads.forEach((l) => {
      const key = new Date(l.created_at).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
    return Array.from(buckets.entries());
  }, [leads]);

  const maxDay = Math.max(1, ...byDay.map(([, n]) => n));

  return (
    <div className="space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Статистика</div>
        <h1 className="mt-2 font-display text-4xl">Аналитика обращений</h1>
        <p className="mt-2 text-sm text-muted-foreground">Всего обращений: {loading ? "—" : leads.length}</p>
      </header>

      <Panel title="За последние 14 дней">
        <div className="flex h-40 items-end gap-2">
          {byDay.map(([day, n]) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-[10px] text-muted-foreground">{n || ""}</div>
              <div
                className="w-full rounded-t bg-primary/60 transition-all"
                style={{ height: `${(n / maxDay) * 100}%`, minHeight: n ? 4 : 1 }}
                title={`${day}: ${n}`}
              />
              <div className="text-[9px] text-muted-foreground">{day.slice(5)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-3">
        <Panel title="По категориям"><BarList items={byCategory} /></Panel>
        <Panel title="По статусам"><BarList items={byStatus} /></Panel>
        <Panel title="По срочности"><BarList items={byUrgency} /></Panel>
      </div>
    </div>
  );
}

function groupCount<T>(arr: T[], key: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  arr.forEach((x) => { const k = key(x); m.set(k, (m.get(k) ?? 0) + 1); });
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
      <div className="mb-5 text-[11px] uppercase tracking-[0.18em] text-foreground/60">{title}</div>
      {children}
    </section>
  );
}

function BarList({ items }: { items: [string, number][] }) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет данных</p>;
  return (
    <ul className="space-y-3">
      {items.map(([label, n]) => (
        <li key={label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate">{label}</span>
            <span className="font-mono text-xs text-muted-foreground">{n}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/50">
            <div className="h-full bg-primary/70" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
