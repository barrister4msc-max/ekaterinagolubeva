import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

import {
  Search,
  SlidersHorizontal,
  Plus,
  Users,
  Clock,
  CheckCircle2,
  TrendingUp,
  X,
  FileText,
  AlertTriangle,
  CheckSquare,
  Inbox,
  KanbanSquare,
  MessageSquare,
  Send,
} from "lucide-react";
import { listLeadsFn } from "@/lib/admin-leads.functions";
import {
  listConversationsByLeadFn,
  listMessagesFn,
  listInboxFn,
} from "@/lib/admin-inbox.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/workspace/crm")({
  component: CRMPage,
});

const columns = [
  { id: "new", label: "NEW", dot: "bg-blue-500" },
  { id: "contacted", label: "CONTACTED", dot: "bg-cyan-500" },
  { id: "waiting_documents", label: "WAITING DOCS", dot: "bg-amber-500" },
  { id: "analysis", label: "ANALYSIS", dot: "bg-violet-500" },
  { id: "offer_sent", label: "OFFER SENT", dot: "bg-blue-600" },
  { id: "in_work", label: "IN WORK", dot: "bg-green-500" },
  { id: "court", label: "COURT", dot: "bg-red-500" },
  { id: "closed", label: "CLOSED", dot: "bg-neutral-400" },
];

type Lead = {
  id: string;
  name: string;
  phone: string;
  original_text: string;
  pipeline_stage: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  ai_summary: string | null;
  next_step: string | null;
  risks: string[] | null;
};

type Conversation = {
  id: string;
  lead_id: string;
  channel: string;
  status: string;
  last_message_at: string | null;
  external_user_id: string | null;
  leads?: { id: string; name: string; phone: string } | null;
  last_message?: { message_text: string | null; direction: string; created_at: string } | null;
};


type Message = {
  id: string;
  conversation_id: string;
  channel: string;
  direction: string;
  message_text: string | null;
  ai_generated: boolean;
  created_at: string;
};

function priorityClass(priority: string | null) {
  if (priority === "urgent" || priority === "high") return "bg-red-100 text-red-700";
  if (priority === "normal" || priority === "medium") return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

const CHANNEL_META: Record<string, { label: string; cls: string }> = {
  telegram: { label: "Telegram", cls: "bg-sky-100 text-sky-700" },
  whatsapp: { label: "WhatsApp", cls: "bg-emerald-100 text-emerald-700" },
  website: { label: "Website", cls: "bg-neutral-200 text-neutral-700" },
  avito: { label: "Avito", cls: "bg-lime-100 text-lime-800" },
};

function ChannelBadge({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel] ?? { label: channel, cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function CRMPage() {
  const { session } = useAuth();
  const listLeads = useServerFn(listLeadsFn);
  const listInbox = useServerFn(listInboxFn);

  const [view, setView] = useState<"pipeline" | "inbox">("pipeline");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [inbox, setInbox] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "inbox" | "documents" | "tasks" | "timeline">("overview");

  const reload = useCallback(() => {
    return Promise.all([listLeads({ data: {} }), listInbox({ data: {} })])
      .then(([l, c]) => {
        setLeads((l.leads as unknown as Lead[]) ?? []);
        setInbox((c.conversations as unknown as Conversation[]) ?? []);
      });
  }, [listLeads, listInbox]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [session, reload]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("inbox-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        reload();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversation_messages" }, () => {
        reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, reload]);


  const kpi = useMemo(() => {
    const inWork = leads.filter((l) => ["contacted", "analysis", "in_work", "offer_sent", "court"].includes(l.pipeline_stage ?? "")).length;
    const closed = leads.filter((l) => l.pipeline_stage === "closed" || l.status === "closed").length;
    const conv = leads.length ? Math.round((closed / leads.length) * 100) : 0;
    return { total: leads.length, inWork, closed, conv };
  }, [leads]);

  return (
    <div className="space-y-6 pb-8">
      <div className="sticky top-0 z-20 flex flex-col gap-6 bg-[oklch(0.97_0.012_75)] pb-4 pt-2 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="font-display text-4xl leading-tight">Legal CRM</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Pipeline + Omnichannel Inbox
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex rounded-xl border border-border bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView("pipeline")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === "pipeline" ? "bg-neutral-950 text-white" : "text-muted-foreground"}`}
            >
              <KanbanSquare size={14} /> Pipeline
            </button>
            <button
              type="button"
              onClick={() => setView("inbox")}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === "inbox" ? "bg-neutral-950 text-white" : "text-muted-foreground"}`}
            >
              <Inbox size={14} /> Inbox
              {inbox.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[11px]">{inbox.length}</span>
              )}
            </button>
          </div>

          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm text-muted-foreground shadow-sm">
            <Search size={16} />
            Поиск...
          </div>

          <button className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm shadow-sm">
            <SlidersHorizontal size={16} />
            Фильтры
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} value={String(kpi.total)} label="Всего лидов" sub="из Supabase" />
        <Kpi icon={Clock} value={String(kpi.inWork)} label="В работе" sub="активные стадии" />
        <Kpi icon={CheckCircle2} value={String(kpi.closed)} label="Завершено" sub="closed" />
        <Kpi icon={TrendingUp} value={`${kpi.conv}%`} label="Конверсия" sub="closed / total" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-white/55 p-12 text-center text-sm text-muted-foreground">
          Загрузка…
        </div>
      ) : view === "pipeline" ? (
        <PipelineView leads={leads} onSelect={(l) => { setSelectedLead(l); setActiveTab("overview"); }} />
      ) : (
        <InboxView
          conversations={inbox}
          onSelect={(c) => {
            const lead = leads.find((l) => l.id === c.lead_id);
            if (lead) {
              setSelectedLead(lead);
              setActiveTab("inbox");
            }
          }}
        />
      )}

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelectedLead(null)}
        />
      ) : null}
    </div>
  );
}

function PipelineView({ leads, onSelect }: { leads: Lead[]; onSelect: (l: Lead) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-white/55 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const colLeads = leads.filter((l) => (l.pipeline_stage ?? "new") === column.id);
          return (
            <section
              key={column.id}
              className="min-h-[260px] rounded-2xl border border-border/60 bg-white/70 p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">
                    {column.label}
                  </h2>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {colLeads.length}
                </span>
              </div>
              <div className="space-y-3">
                {colLeads.map((lead) => (
                  <article
                    key={lead.id}
                    onClick={() => onSelect(lead)}
                    className="group cursor-pointer rounded-2xl border border-border/60 bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                  >
                    <h3 className="text-sm font-semibold">{lead.name}</h3>
                    <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">
                      {lead.original_text}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] ${priorityClass(lead.priority)}`}>
                        {lead.priority ?? "normal"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{fmtDate(lead.created_at)}</span>
                    </div>
                  </article>
                ))}
                {colLeads.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                    Пусто
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InboxView({ conversations, onSelect }: { conversations: Conversation[]; onSelect: (c: Conversation) => void }) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-12 text-center">
        <Inbox className="mx-auto mb-3 text-muted-foreground" size={28} />
        <h3 className="font-medium">Inbox пуст</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Здесь появятся переписки из Telegram, WhatsApp, сайта и Avito.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-white shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
      <div className="divide-y">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex w-full items-start gap-4 p-4 text-left hover:bg-secondary/40"
          >
            <ChannelBadge channel={c.channel} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="truncate text-sm font-medium">
                  {c.leads?.name ?? "Без лида"}
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(c.last_message_at)}</div>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {c.last_message?.message_text
                  ? `${c.last_message.direction === "outbound" ? "Вы: " : ""}${c.last_message.message_text}`
                  : (c.external_user_id ?? c.leads?.phone ?? "—")}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                статус: {c.status}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}


function LeadDrawer({
  lead,
  activeTab,
  setActiveTab,
  onClose,
}: {
  lead: Lead;
  activeTab: "overview" | "inbox" | "documents" | "tasks" | "timeline";
  setActiveTab: (t: "overview" | "inbox" | "documents" | "tasks" | "timeline") => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-md"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-[oklch(0.98_0.01_75)] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-4 inline-flex rounded-full border bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Legal dossier
            </div>
            <h2 className="font-display text-4xl">{lead.name}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{lead.original_text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs ${priorityClass(lead.priority)}`}>
                {lead.priority ?? "normal"}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-muted-foreground">
                {fmtDate(lead.created_at)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-muted-foreground">
                {lead.phone}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-2xl border bg-white p-3 shadow-sm hover:bg-secondary" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border bg-white p-2">
          {([
            ["overview", "Overview"],
            ["inbox", "Inbox"],
            ["documents", "Documents"],
            ["tasks", "Tasks"],
            ["timeline", "Timeline"],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm hover:bg-secondary ${
                activeTab === tab ? "bg-neutral-950 text-white" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Stage</div>
                <div className="mt-2 text-sm font-medium">{lead.pipeline_stage ?? "new"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Next step</div>
                <div className="mt-2 text-sm font-medium">{lead.next_step ?? "—"}</div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</div>
                <div className="mt-2 text-sm font-medium">{lead.status}</div>
              </div>
            </div>
            {lead.ai_summary && (
              <div className="mt-8 rounded-3xl border bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={17} />
                  <h3 className="font-medium">AI Summary</h3>
                </div>
                <p className="mt-5 text-sm leading-6 text-muted-foreground">{lead.ai_summary}</p>
              </div>
            )}
          </>
        )}

        {activeTab === "inbox" && <LeadInbox leadId={lead.id} />}

        {activeTab === "documents" && (
          <section className="mt-8 rounded-3xl border bg-white p-6">
            <div className="flex items-center gap-2">
              <FileText size={17} />
              <h3 className="font-medium">Documents</h3>
            </div>
            <div className="mt-5 text-sm text-muted-foreground">Подключение к lead_documents — следующим шагом.</div>
          </section>
        )}

        {activeTab === "tasks" && (
          <section className="mt-8 rounded-3xl border bg-white p-6">
            <div className="flex items-center gap-2">
              <CheckSquare size={17} />
              <h3 className="font-medium">Tasks</h3>
            </div>
            <div className="mt-5 text-sm text-muted-foreground">Подключение к lead_tasks — следующим шагом.</div>
          </section>
        )}

        {activeTab === "timeline" && (
          <div className="mt-8 rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
            Подключение к lead_events — следующим шагом.
          </div>
        )}
      </aside>
    </div>
  );
}

function LeadInbox({ leadId }: { leadId: string }) {
  const listConvs = useServerFn(listConversationsByLeadFn);
  const listMsgs = useServerFn(listMessagesFn);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);

  useEffect(() => {
    setLoading(true);
    listConvs({ data: { leadId } })
      .then((r) => {
        const list = (r.conversations as unknown as Conversation[]) ?? [];
        setConvs(list);
        if (list[0]) setSelected(list[0].id);
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  const reloadMsgs = useCallback(() => {
    if (!selected) return Promise.resolve();
    return listMsgs({ data: { conversationId: selected } })
      .then((r) => setMessages((r.messages as unknown as Message[]) ?? []));
  }, [selected, listMsgs]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    setLoadingMsg(true);
    reloadMsgs().finally(() => setLoadingMsg(false));
  }, [selected, reloadMsgs]);

  useEffect(() => {
    if (!selected) return;
    const ch = supabase
      .channel(`conv-${selected}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages", filter: `conversation_id=eq.${selected}` },
        () => { reloadMsgs(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected, reloadMsgs]);


  if (loading) {
    return <div className="mt-8 text-sm text-muted-foreground">Загрузка переписок…</div>;
  }

  if (convs.length === 0) {
    return (
      <div className="mt-8 rounded-3xl border bg-white p-8 text-center">
        <MessageSquare className="mx-auto mb-3 text-muted-foreground" size={24} />
        <h3 className="font-medium">Переписок пока нет</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Когда лид напишет в Telegram, WhatsApp, на сайте или в Avito — диалоги появятся здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap gap-2">
        {convs.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              selected === c.id ? "border-neutral-950 bg-white shadow-sm" : "border-border bg-white/60"
            }`}
          >
            <ChannelBadge channel={c.channel} />
            <span className="text-muted-foreground">{fmtDate(c.last_message_at)}</span>
          </button>
        ))}
      </div>

      <div className="rounded-3xl border bg-white p-4">
        {loadingMsg ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Загрузка…</div>
        ) : messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">В этом диалоге пока нет сообщений</div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "bg-neutral-950 text-white"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {m.ai_generated && (
                    <div className="mb-1 text-[10px] uppercase tracking-wider opacity-70">AI draft</div>
                  )}
                  <div className="whitespace-pre-wrap">{m.message_text ?? <em>пусто</em>}</div>
                  <div className="mt-1 text-[10px] opacity-60">{fmtDate(m.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 border-t pt-4">
          <input
            disabled
            placeholder="Ответ (отправка появится после подключения вебхуков)"
            className="h-10 flex-1 rounded-xl border border-border bg-secondary/40 px-3 text-sm text-muted-foreground"
          />
          <button disabled className="flex h-10 items-center gap-2 rounded-xl bg-neutral-300 px-4 text-sm text-white">
            <Send size={14} /> Отправить
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_6px_30px_rgba(0,0,0,0.035)]">
      <div className="flex items-center justify-between">
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-4 text-3xl font-display">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-[11px] text-muted-foreground/80">{sub}</div>
    </div>
  );
}
