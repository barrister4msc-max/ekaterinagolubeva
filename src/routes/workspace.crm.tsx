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
import { listLeadsFn, updateLeadPipelineStageFn } from "@/lib/admin-leads.functions";
import { toast } from "sonner";
import {
  listConversationsByLeadFn,
  listMessagesFn,
  listInboxFn,
  sendTelegramMessageFn,
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
  category: string | null;
  source: string | null;
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary/50"
      >
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </label>
  );
}

function CRMPage() {
  const { session } = useAuth();
  const listLeads = useServerFn(listLeadsFn);
  const listInbox = useServerFn(listInboxFn);
  const updateStage = useServerFn(updateLeadPipelineStageFn);


  const [view, setView] = useState<"pipeline" | "inbox">("pipeline");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [inbox, setInbox] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "inbox" | "documents" | "tasks" | "timeline">("overview");

  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<{
    channel: string;
    leadStatus: string;
    pipelineStage: string;
    priority: string;
    unread: "all" | "unread";
    date: "all" | "today" | "7d" | "30d";
  }>({
    channel: "all",
    leadStatus: "all",
    pipelineStage: "all",
    priority: "all",
    unread: "all",
    date: "all",
  });

  const resetFilters = () =>
    setFilters({ channel: "all", leadStatus: "all", pipelineStage: "all", priority: "all", unread: "all", date: "all" });

  const activeFiltersCount = useMemo(
    () => Object.values(filters).filter((v) => v !== "all").length,
    [filters],
  );

  const dateThreshold = useMemo(() => {
    if (filters.date === "all") return null;
    const now = Date.now();
    if (filters.date === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (filters.date === "7d") return now - 7 * 24 * 60 * 60 * 1000;
    if (filters.date === "30d") return now - 30 * 24 * 60 * 60 * 1000;
    return null;
  }, [filters.date]);

  const q = searchQuery.trim().toLowerCase();

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filters.leadStatus !== "all" && l.status !== filters.leadStatus) return false;
      if (filters.pipelineStage !== "all" && (l.pipeline_stage ?? "new") !== filters.pipelineStage) return false;
      if (filters.priority !== "all" && (l.priority ?? "normal") !== filters.priority) return false;
      if (dateThreshold && new Date(l.created_at).getTime() < dateThreshold) return false;
      if (q) {
        const hay = [l.name, l.phone, l.original_text, l.category ?? "", l.source ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filters, dateThreshold, q]);

  const filteredInbox = useMemo(() => {
    return inbox.filter((c) => {
      if (filters.channel !== "all" && c.channel !== filters.channel) return false;
      if (filters.unread === "unread") {
        const last = c.last_message;
        if (!last || last.direction !== "inbound") return false;
      }
      if (dateThreshold) {
        const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        if (t < dateThreshold) return false;
      }
      if (q) {
        const hay = [
          c.leads?.name ?? "",
          c.leads?.phone ?? "",
          c.channel,
          c.last_message?.message_text ?? "",
          c.external_user_id ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inbox, filters, dateThreshold, q]);

  const reload = useCallback(async () => {
    const [leadsResult, inboxResult] = await Promise.allSettled([
      listLeads({ data: {} }),
      listInbox({ data: {} }),
    ]);


    if (leadsResult.status === "fulfilled") {
      setLeads((leadsResult.value.leads as unknown as Lead[]) ?? []);
    } else {
      console.error("[CRM] listLeads failed", leadsResult.reason);
    }

    if (inboxResult.status === "fulfilled") {
      const conversationsData = (inboxResult.value.conversations as unknown as Conversation[]) ?? [];
      console.log("[Inbox] conversationsData", conversationsData, "length", conversationsData.length);
      setInbox(conversationsData);
      setInboxError(null);
    } else {
      console.error("[Inbox] listInbox failed", inboxResult.reason);
      setInboxError(inboxResult.reason instanceof Error ? inboxResult.reason.message : "Не удалось загрузить Inbox");
    }
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

  const handleMoveLead = useCallback(
    async (leadId: string, targetStage: string) => {
      const prev = leads.find((l) => l.id === leadId);
      if (!prev) return;
      if ((prev.pipeline_stage ?? "new") === targetStage) return;

      // optimistic
      const optimistic: Partial<Lead> = { pipeline_stage: targetStage };
      if (targetStage === "closed") optimistic.status = "closed";
      else if (prev.status === "closed") optimistic.status = "in_progress";

      setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, ...optimistic } : l)));
      setSelectedLead((s) => (s && s.id === leadId ? { ...s, ...optimistic } : s));

      try {
        const res = await updateStage({ data: { id: leadId, pipeline_stage: targetStage as never } });
        const updated = (res as { lead: Lead | null }).lead;
        if (updated) {
          setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, ...updated } : l)));
          setSelectedLead((s) => (s && s.id === leadId ? { ...s, ...updated } : s));
        }
        toast.success("Стадия обновлена");
      } catch (e) {
        // revert
        setLeads((ls) => ls.map((l) => (l.id === leadId ? prev : l)));
        setSelectedLead((s) => (s && s.id === leadId ? prev : s));
        toast.error(e instanceof Error ? e.message : "Не удалось обновить стадию");
      }
    },
    [leads, updateStage],
  );



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

          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm shadow-sm">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени, телефону, тексту…"
              className="w-56 bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
                aria-label="Очистить поиск"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className={`flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm shadow-sm ${filtersOpen || activeFiltersCount > 0 ? "bg-neutral-950 text-white" : "bg-white"}`}
            >
              <SlidersHorizontal size={16} />
              Фильтры
              {activeFiltersCount > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-[11px]">{activeFiltersCount}</span>
              )}
            </button>
            {filtersOpen && (
              <div className="absolute right-0 top-12 z-30 w-80 space-y-3 rounded-2xl border border-border bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
                <FilterSelect
                  label="Канал"
                  value={filters.channel}
                  onChange={(v) => setFilters((f) => ({ ...f, channel: v }))}
                  options={[
                    ["all", "Все"],
                    ["telegram", "Telegram"],
                    ["whatsapp", "WhatsApp"],
                    ["website", "Website"],
                    ["avito", "Avito"],
                  ]}
                />
                <FilterSelect
                  label="Статус лида"
                  value={filters.leadStatus}
                  onChange={(v) => setFilters((f) => ({ ...f, leadStatus: v }))}
                  options={[
                    ["all", "Все"],
                    ["new", "New"],
                    ["in_progress", "In progress"],
                    ["waiting", "Waiting"],
                    ["closed", "Closed"],
                  ]}
                />
                <FilterSelect
                  label="Pipeline stage"
                  value={filters.pipelineStage}
                  onChange={(v) => setFilters((f) => ({ ...f, pipelineStage: v }))}
                  options={[["all", "Все"], ...columns.map((c) => [c.id, c.label] as [string, string])]}
                />
                <FilterSelect
                  label="Приоритет"
                  value={filters.priority}
                  onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
                  options={[
                    ["all", "Все"],
                    ["urgent", "Urgent"],
                    ["high", "High"],
                    ["normal", "Normal"],
                    ["low", "Low"],
                  ]}
                />
                <FilterSelect
                  label="Inbox"
                  value={filters.unread}
                  onChange={(v) => setFilters((f) => ({ ...f, unread: v as "all" | "unread" }))}
                  options={[
                    ["all", "Все диалоги"],
                    ["unread", "Только непрочитанные"],
                  ]}
                />
                <FilterSelect
                  label="Дата"
                  value={filters.date}
                  onChange={(v) => setFilters((f) => ({ ...f, date: v as typeof filters.date }))}
                  options={[
                    ["all", "Все время"],
                    ["today", "Сегодня"],
                    ["7d", "7 дней"],
                    ["30d", "30 дней"],
                  ]}
                />
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Сбросить фильтры
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs text-white"
                  >
                    Готово
                  </button>
                </div>
              </div>
            )}
          </div>

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
        <PipelineView leads={filteredLeads} onSelect={(l) => { setSelectedLead(l); setActiveTab("overview"); }} onMove={handleMoveLead} />
      ) : (
        <InboxView
          conversations={filteredInbox}
          error={inboxError}
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

function PipelineView({
  leads,
  onSelect,
  onMove,
}: {
  leads: Lead[];
  onSelect: (l: Lead) => void;
  onMove: (leadId: string, targetStage: string) => void | Promise<void>;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-white/55 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column) => {
          const colLeads = leads.filter((l) => (l.pipeline_stage ?? "new") === column.id);
          const isOver = dragOver === column.id;
          return (
            <section
              key={column.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== column.id) setDragOver(column.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOver((c) => (c === column.id ? null : c));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/lead-id") || draggingId;
                setDragOver(null);
                setDraggingId(null);
                if (id) void onMove(id, column.id);
              }}
              className={`min-h-[260px] rounded-2xl border p-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur transition-colors ${
                isOver
                  ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30"
                  : "border-border/60 bg-white/70"
              }`}
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
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead-id", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOver(null);
                    }}
                    onClick={() => onSelect(lead)}
                    className={`group select-none rounded-2xl border border-border/60 bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] cursor-grab active:cursor-grabbing ${
                      draggingId === lead.id ? "opacity-50" : ""
                    }`}
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


function InboxView({
  conversations,
  error,
  onSelect,
}: {
  conversations: Conversation[];
  error: string | null;
  onSelect: (c: Conversation) => void;
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-white p-12 text-center">
        <Inbox className="mx-auto mb-3 text-muted-foreground" size={28} />
        <h3 className="font-medium">Inbox не загрузился</h3>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

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
const [documents, setDocuments] = useState<any[]>([]);

const loadDocuments = useCallback(async () => {
  const { data, error } = await supabase
    .from("lead_documents")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  setDocuments(data || []);
}, [lead.id]);

useEffect(() => {
  loadDocuments();
}, [loadDocuments]);
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
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <FileText size={17} />
      <h3 className="font-medium">Documents</h3>
    </div>

    <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-sm text-white">
      <Plus size={14} />
      Upload

      <input
  type="file"
  multiple
  className="hidden"
  onChange={async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const filePath = `${lead.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("lead-documents")
        .upload(filePath, file);

      if (uploadError) {
        console.error(uploadError);
        alert(uploadError.message);
        return;
      }

      const { error: dbError } = await supabase
        .from("lead_documents")
        .insert({
          lead_id: lead.id,
          file_url: filePath,
        });

      if (dbError) {
        console.error(dbError);
        alert(dbError.message);
        return;
      }
    }

    await loadDocuments();
    alert("Документы загружены");
    e.target.value = "";
  }}
/>
          
    </label>
  </div>

  <div className="mt-6 space-y-3">
  {documents.length === 0 ? (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Документов пока нет
    </div>
  ) : (
    documents.map((doc) => (
      <div
        key={doc.id}
        className="flex items-center justify-between rounded-2xl border bg-white p-4"
      >
        <div>
          <div className="text-sm font-medium">{doc.file_url.split("/").pop()}</div>

          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString("ru-RU")}
          </div>
        </div>
<div className="flex items-center gap-2">

  <button
    onClick={async () => {
      const { data } = await supabase.storage
        .from("lead-documents")
        .createSignedUrl(doc.file_url, 60);

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    }}
    className="rounded-xl border px-3 py-2 text-xs hover:bg-secondary"
  >
    Открыть
  </button>

  <button
    onClick={async () => {
      const confirmed = confirm("Удалить документ?");
      if (!confirmed) return;

      const { error: storageError } = await supabase.storage
        .from("lead-documents")
        .remove([doc.file_url]);

      if (storageError) {
        console.error(storageError);
        alert(storageError.message);
        return;
      }

      const { error: dbError } = await supabase
        .from("lead_documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) {
        console.error(dbError);
        alert(dbError.message);
        return;
      }

      await loadDocuments();
    }}
    className="rounded-xl border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
  >
    Удалить
  </button>

</div>

</div>
    ))
  )}
</div>
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
  const sendTg = useServerFn(sendTelegramMessageFn);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

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

        {(() => {
          const activeConv = convs.find((c) => c.id === selected);
          const isTelegram = activeConv?.channel === "telegram";
          const canSend = !!selected && isTelegram && draft.trim().length > 0 && !sending;
          const submit = async () => {
            if (!selected || !canSend) return;
            setSending(true);
            setSendError(null);
            try {
              await sendTg({ data: { conversationId: selected, text: draft.trim() } });
              setDraft("");
              await reloadMsgs();
            } catch (e) {
              setSendError(e instanceof Error ? e.message : "Не удалось отправить");
            } finally {
              setSending(false);
            }
          };
          return (
            <div className="mt-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  disabled={!selected || !isTelegram || sending}
                  placeholder={isTelegram ? "Ваш ответ…" : "Отправка доступна только для Telegram"}
                  className="h-10 flex-1 rounded-xl border border-border bg-white px-3 text-sm disabled:bg-secondary/40 disabled:text-muted-foreground"
                />
                <button
                  onClick={submit}
                  disabled={!canSend}
                  className="flex h-10 items-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm text-white disabled:bg-neutral-300"
                >
                  <Send size={14} /> {sending ? "Отправка…" : "Отправить"}
                </button>
              </div>
              {sendError && (
                <div className="mt-2 text-xs text-red-600">{sendError}</div>
              )}
            </div>
          );
        })()}
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
