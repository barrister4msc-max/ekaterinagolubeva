import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Save, AlertTriangle } from "lucide-react";
import { listLeadsFn, updateLeadFn } from "@/lib/admin-leads.functions";
import { useAuth } from "@/hooks/use-auth";

type Lead = {
  id: string;
  name: string;
  phone: string;
  contact: string | null;
  original_text: string;
  category: string | null;
  qa: Array<{ question: string; answer: string }>;
  ai_summary: string | null;
  urgency: "low" | "medium" | "high" | null;
  risks: string[];
  next_step: string | null;
  documents_checklist: string[];
  status: "new" | "in_progress" | "waiting" | "closed";
  admin_notes: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Lead["status"], string> = {
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ожидание",
  closed: "Закрыта",
};

const URGENCY_LABEL: Record<NonNullable<Lead["urgency"]>, { label: string; cls: string }> = {
  low: { label: "Низкая", cls: "bg-secondary text-foreground/70" },
  medium: { label: "Средняя", cls: "bg-primary/10 text-primary" },
  high: { label: "Высокая", cls: "bg-destructive/10 text-destructive" },
};

export function LeadsAdmin() {
  const listLeads = useServerFn(listLeadsFn);
  const updateLead = useServerFn(updateLeadFn);
  const { session } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ status?: Lead["status"]; category?: string }>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await listLeads({ data: filter });
      setLeads((res.leads as unknown as Lead[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    load();
  }, [filter.status, filter.category, session]);

  async function patch(id: string, patch: { status?: Lead["status"]; admin_notes?: string | null }) {
    try {
      await updateLead({ data: { id, ...patch } });
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } as Lead : l)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось обновить");
    }
  }

  function exportCsv() {
    const rows = [
      [
        "Дата", "Имя", "Телефон", "Контакт", "Категория", "Срочность",
        "Статус", "Резюме", "След. шаг", "Риски", "Документы", "Заметки",
      ],
      ...leads.map((l) => [
        new Date(l.created_at).toLocaleString("ru-RU"),
        l.name, l.phone, l.contact ?? "",
        l.category ?? "", l.urgency ?? "",
        STATUS_LABEL[l.status],
        l.ai_summary ?? "", l.next_step ?? "",
        l.risks.join("; "), l.documents_checklist.join("; "),
        l.admin_notes ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    high: leads.filter((l) => l.urgency === "high").length,
  };

  const categories = Array.from(new Set(leads.map((l) => l.category).filter(Boolean))) as string[];

  return (
    <section className="mt-20 border-t border-border pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow mb-3">CRM</div>
          <h2 className="text-3xl md:text-4xl">Заявки с сайта</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Всего: {stats.total} · Новых: {stats.new} · Срочных: {stats.high}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter.status ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, status: (e.target.value || undefined) as Lead["status"] | undefined }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Все статусы</option>
            {(Object.keys(STATUS_LABEL) as Lead["status"][]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={filter.category ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value || undefined }))}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Все категории</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={exportCsv} className="btn-ghost"><Download size={14}/> CSV</button>
        </div>
      </div>

      {err && (
        <div className="mt-6 flex items-center gap-2 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle size={14}/> {err}
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded border border-border">
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin"/> Загрузка…
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Пока нет заявок.</div>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead) => (
              <li key={lead.id} className="bg-background">
                <button
                  onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                  className="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-card"
                >
                  {expanded === lead.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                  <div className="flex-1 grid grid-cols-2 gap-2 md:grid-cols-6">
                    <div className="text-xs text-muted-foreground">
                      {new Date(lead.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-sm text-muted-foreground">{lead.phone}</div>
                    <div className="text-sm">{lead.category ?? "—"}</div>
                    <div>
                      {lead.urgency ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${URGENCY_LABEL[lead.urgency].cls}`}>
                          {URGENCY_LABEL[lead.urgency].label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{STATUS_LABEL[lead.status]}</div>
                  </div>
                </button>

                {expanded === lead.id && (
                  <LeadDetail lead={lead} onPatch={(p) => patch(lead.id, p)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LeadDetail({ lead, onPatch }: { lead: Lead; onPatch: (p: { status?: Lead["status"]; admin_notes?: string | null }) => void }) {
  const [notes, setNotes] = useState(lead.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function saveNotes() {
    setSaving(true);
    await onPatch({ admin_notes: notes });
    setSaving(false);
  }

  return (
    <div className="grid gap-8 border-t border-border bg-secondary/30 p-6 md:grid-cols-2">
      <div className="space-y-5">
        <Block label="Исходное обращение">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{lead.original_text}</p>
        </Block>

        {lead.qa.length > 0 && (
          <Block label="Уточнения">
            <ul className="space-y-3 text-sm">
              {lead.qa.map((x, i) => (
                <li key={i}>
                  <div className="text-muted-foreground">{x.question}</div>
                  <div>{x.answer}</div>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {lead.contact && (
          <Block label="Доп. контакт">
            <p className="text-sm">{lead.contact}</p>
          </Block>
        )}
      </div>

      <div className="space-y-5">
        {lead.ai_summary && (
          <Block label="AI-резюме">
            <p className="text-sm leading-relaxed">{lead.ai_summary}</p>
          </Block>
        )}
        {lead.next_step && (
          <Block label="Рекомендуемый шаг">
            <p className="text-sm">{lead.next_step}</p>
          </Block>
        )}
        {lead.risks.length > 0 && (
          <Block label="Риски">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {lead.risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </Block>
        )}
        {lead.documents_checklist.length > 0 && (
          <Block label="Документы">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {lead.documents_checklist.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </Block>
        )}

        <Block label="Статус">
          <select
            value={lead.status}
            onChange={(e) => onPatch({ status: e.target.value as Lead["status"] })}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {(Object.keys(STATUS_LABEL) as Lead["status"][]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Block>

        <Block label="Заметки">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full rounded border border-border bg-background p-3 text-sm"
          />
          <button onClick={saveNotes} disabled={saving} className="btn-ghost mt-2">
            <Save size={14}/> {saving ? "..." : "Сохранить"}
          </button>
        </Block>
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}
