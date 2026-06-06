import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { GeneratedDocumentsBlock } from "@/components/crm/generated-documents-block";

export const Route = createFileRoute("/workspace/crm")({
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
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
  source_crm_lead_id: string | null;
lead_number: number | null;
archived_at: string | null;
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
  const { lead: leadParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const listLeads = useServerFn(listLeadsFn);
  const listInbox = useServerFn(listInboxFn);
  const updateStage = useServerFn(updateLeadPipelineStageFn);


  const [view, setView] =
  useState<"pipeline" | "inbox" | "archive">("pipeline");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [inbox, setInbox] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<
  "overview" | "cases" | "inbox" | "documents" | "compliance" | "tasks" | "timeline"
>("overview");

  // Sync selectedLead with ?lead= URL param (runs after leads load from Supabase).
  // Matches against both internal lead.id and source_crm_lead_id, because
  // external links (Telegram bot, n8n) reference the crm_lead id.
  useEffect(() => {
    if (!leadParam) {
      if (selectedLead) setSelectedLead(null);
      return;
    }
    if (
      selectedLead &&
      (selectedLead.id === leadParam || selectedLead.source_crm_lead_id === leadParam)
    ) {
      return;
    }
    if (!leads.length) return; // wait for leads to load
    const found = leads.find(
      (l) => l.id === leadParam || l.source_crm_lead_id === leadParam,
    );
    if (found) setSelectedLead(found);
  }, [leadParam, leads, selectedLead]);

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
      if (l.archived_at) return false;
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
const archivedLeads = useMemo(() => {
  return leads.filter((l) => l.archived_at);
}, [leads]);
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
        await supabase
  .from("lead_events")
  .insert({
    lead_id: leadId,
    type: "stage_changed",
    message: `Стадия изменена на: ${targetStage}`,
  });
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
    <div className="space-y-6 rounded-3xl border border-white/40 bg-white/10 p-5 pb-8 shadow-[0_20px_60px_rgba(15,30,55,0.16)] backdrop-blur-sm">
      <div className="sticky top-0 z-20 flex flex-col gap-6 border-b border-white/20 bg-white/10 pb-5 pt-1 backdrop-blur-sm xl:flex-row xl:items-start xl:justify-between">

        <div />

        <div className="flex flex-wrap gap-3">
          <div className="inline-flex rounded-xl border border-border/70 bg-background p-1 shadow-sm">
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
            <button
  type="button"
  onClick={() => setView("archive")}
  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
    view === "archive"
      ? "bg-neutral-950 text-white"
      : "text-muted-foreground"
  }`}
>
  <FileText size={14} />
  Archive
</button>
          </div>

          <div className="flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-sm shadow-sm">
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
              className={`flex h-11 items-center gap-2 rounded-xl border border-border/70 px-4 text-sm shadow-sm ${filtersOpen || activeFiltersCount > 0 ? "bg-neutral-950 text-white" : "bg-background"}`}
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
        <div className="rounded-2xl border border-border/70 bg-card/88 p-12 text-center text-sm text-muted-foreground shadow-[0_18px_70px_rgba(47,41,37,0.10)] backdrop-blur-xl">
          Загрузка…
        </div>
      ) : view === "pipeline" ? (
  <PipelineView
    leads={filteredLeads}
    onSelect={(l) => {
      navigate({ search: { lead: l.id } });
      setActiveTab("overview");
    }}
    onMove={handleMoveLead}
  />
) : view === "archive" ? (
  <PipelineView
    leads={archivedLeads}
    onSelect={(l) => {
      navigate({ search: { lead: l.id } });
      setActiveTab("overview");
    }}
    onMove={handleMoveLead}
  />
) : (
  <InboxView
          conversations={filteredInbox}
          error={inboxError}
          onSelect={(c) => {
            const lead = leads.find((l) => l.id === c.lead_id);
            if (lead) {
              navigate({ search: { lead: lead.id } });
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
          onClose={() => navigate({ search: {} })}
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
    <div>
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
              className={`min-h-[260px] rounded-2xl border p-4 backdrop-blur-sm transition-colors ${
                isOver
                  ? "border-primary/60 bg-primary/10 ring-2 ring-primary/30"
                  : "border-white/30 bg-white/10 backdrop-blur-sm"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
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
                    className={`group select-none rounded-xl border border-white/50 bg-white/20 p-3 shadow-[0_2px_8px_rgba(15,30,55,0.08)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/30 hover:shadow-[0_8px_24px_rgba(15,30,55,0.14)] cursor-grab active:cursor-grabbing ${
                      draggingId === lead.id ? "opacity-50" : ""
                    }`}
                  >
                    <h3 className="text-sm font-semibold">
  №{lead.lead_number ?? "—"} · {lead.name}
</h3>
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
  activeTab: "overview" | "cases" | "inbox" | "documents" | "compliance" | "tasks" | "timeline"; 
  setActiveTab: (t: "overview" | "cases" | "inbox" | "documents" | "compliance" | "tasks" | "timeline") => void;
  onClose: () => void;
}) {
const [documents, setDocuments] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [previewName, setPreviewName] = useState<string | null>(null);
  const [analysisDoc, setAnalysisDoc] = useState<any | null>(null);
  const [expandedAnalysisId, setExpandedAnalysisId] =
  useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] =
  useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [legalReviewsByDocumentId, setLegalReviewsByDocumentId] =
  useState<Record<string, any>>({});
  const [complianceChecks, setComplianceChecks] = useState<any[]>([]);    
  const [complianceRunning, setComplianceRunning] = useState(false);
  const [selectedComplianceSubjectType, setSelectedComplianceSubjectType] =
  useState<"person" | "company">("person");
  const [complianceForm, setComplianceForm] = useState({
  subject_type: "company",
  check_subject: lead.name || "",
  inn: "",
  ogrn: "",
  ogrnip: "",
  fio: "",
  birth_date: "",
  region: "",
});
  const uploadDocuments = async (files: File[]) => {
  console.log("UPLOAD FILES:", files);

  if (files.length === 0) {
    alert("Файл не выбран");
    return;
  }

  for (const file of files) {
    console.log("UPLOAD FILE:", file.name, file.size, file.type);

    if (file.size > 20 * 1024 * 1024) {
      alert("Файл слишком большой. Максимум 20 МБ");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "file";

const safeName = `document-${Date.now()}.${extension}`;

    const filePath = `${lead.id}/${safeName}`;

    console.log("UPLOAD PATH:", filePath);

    const { data: uploadData, error: uploadError } =
      await supabase.storage
        .from("lead-documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

    console.log("UPLOAD RESULT:", uploadData, uploadError);

    if (uploadError) {
      console.error(uploadError);
      alert("Storage upload error: " + uploadError.message);
      return;
    }

    // Resolve dossier context so the document is strictly bound to this lead.
    const crmLeadId = lead.source_crm_lead_id ?? null;
    let crmClientId: string | null = null;
    if (crmLeadId) {
      const { data: crmLeadRow } = await supabase
        .from("crm_leads")
        .select("client_id")
        .eq("id", crmLeadId)
        .maybeSingle();
      crmClientId = (crmLeadRow as any)?.client_id ?? null;
    }

    const { data: insertedDoc, error: dbError } =
      await supabase
        .from("lead_documents")
        .insert({
          lead_id: lead.id,
          crm_lead_id: crmLeadId,
          crm_client_id: crmClientId,
          legal_matter_id: null,
          conversation_id: null,
          file_url: filePath,
          file_name: file.name,
          analysis_status: "uploaded",
        } as any)
        .select("*")
        .single();

    console.log("DB INSERT RESULT:", insertedDoc, dbError);

    if (dbError) {
      console.error(dbError);
      alert("DB insert error: " + dbError.message);
      return;
    }

     await supabase
  .from("lead_events")
  .insert({
    lead_id: lead.id,
    type: "document_uploaded",
    message: `Загружен документ: ${file.name}`,
  });
  }

  await loadDocuments();

  alert("Документы загружены");
};
const loadDocuments = useCallback(async () => {
  const crmLeadId = lead.source_crm_lead_id;
  console.log("DOCUMENTS LEAD DEBUG", {
    leadId: lead.id,
    name: lead.name,
    sourceCrmLeadId: lead.source_crm_lead_id,
  });

  // Strict per-dossier fetch of lead_documents: this lead, or rows already
  // bound to its crm_lead. Never fall back to client-wide queries.
  const leadDocsFilter = crmLeadId
    ? `lead_id.eq.${lead.id},crm_lead_id.eq.${crmLeadId}`
    : `lead_id.eq.${lead.id}`;
  const { data: leadDocs, error: leadDocsError } = await supabase
    .from("lead_documents")
    .select("*")
    .or(leadDocsFilter)
    .order("created_at", { ascending: false });

  if (leadDocsError) {
    console.error(leadDocsError);
  }

  let telegramDocs: any[] = [];



  if (crmLeadId) {
    const { data: convs } = await supabase
      .from("communication_conversations")
      .select("id")
      .eq("crm_lead_id", crmLeadId);


    const convIds = (convs || []).map((c: any) => c.id);

    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from("communication_messages")
        .select("id")
        .in("conversation_id", convIds);

      const msgIds = (msgs || []).map((m: any) => m.id);

      if (msgIds.length > 0) {
        const { data: atts } = await supabase
          .from("communication_attachments")
          .select("*")
          .in("message_id", msgIds)
          .not("storage_path", "is", null)
          .order("created_at", { ascending: false });

        const uniqueAtts = Array.from(
  new Map(
    (atts || [])
      .filter((a: any) => a.storage_path)
      .map((a: any) => [
        `${a.file_name}-${a.file_size}`,
        a,
      ])
  ).values()
);

telegramDocs = uniqueAtts.map((a: any) => ({
  ...a,
  _source: "telegram_attachment",
  file_url: a.storage_path,
  analysis_status: "uploaded",
}));
      }
    }
  }

  const normalizedLeadDocs = (leadDocs || []).map((d: any) => ({
    ...d,
    _source: "lead_documents",
  }));

  const allDocs = [...telegramDocs, ...normalizedLeadDocs].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );

  setDocuments(allDocs);

const documentIds = allDocs
  .filter((d: any) => d._source === "lead_documents")
  .map((d: any) => d.id);

if (documentIds.length > 0) {
  const { data: reviews, error: reviewsError } = await supabase
  .from("legal_document_reviews")
  .select("*")
  .in("document_id", documentIds)
  .order("updated_at", { ascending: false });

  if (reviewsError) {
    console.error("LEGAL REVIEWS LOAD ERROR:", reviewsError);
  } else {
    const byDocId: Record<string, any> = {};

for (const r of reviews || []) {
  if (!r.document_id) continue;
  if (!byDocId[r.document_id]) {
    byDocId[r.document_id] = r;
  }
}

    setLegalReviewsByDocumentId(byDocId);
  }
} else {
  setLegalReviewsByDocumentId({});
}

return allDocs;
}, [lead.id, lead.source_crm_lead_id]);
const loadEvents = useCallback(async () => {
  const { data, error } = await supabase
    .from("lead_events")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  setEvents(data || []);
}, [lead.id]);
const loadComplianceChecks = useCallback(async () => {
  const { data, error } = await supabase
    .from("compliance_checks")
    .select("*")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  setComplianceChecks(data || []);
}, [lead.id]);

useEffect(() => {
  loadComplianceChecks();
}, [loadComplianceChecks]);
useEffect(() => {
  loadDocuments();
}, [loadDocuments]);
  useEffect(() => {
  loadEvents();
}, [loadEvents]);
  const complianceSubjectOptions = useMemo(() => {
  const options: Array<{
    label: string;
    subject_type: "person" | "company";
    check_subject: string;
    fio?: string;
    inn?: string;
    ogrn?: string;
    ogrnip?: string;
    birth_date?: string;
    region?: string;
    source: string;
  }> = [];

  if (lead.name) {
    options.push({
      label: `Заявитель: ${lead.name}`,
      subject_type: "person",
      check_subject: lead.name,
      fio: lead.name,
      source: "lead",
    });
  }

  for (const doc of documents) {
    const a = doc.extracted_data?.structured_analysis || {};

    const persons = Array.isArray(a.persons) ? a.persons : [];
    const companies = Array.isArray(a.companies) ? a.companies : [];

    for (const p of persons) {
      const fio =
        typeof p === "string"
          ? p
          : p.fio || p.name || p.full_name || p.person_name || "";

      if (!fio) continue;

      options.push({
        label: `Физлицо: ${fio} · ${doc.file_name || "документ заявителя"}`,
        subject_type: "person",
        check_subject: fio,
        fio,
        inn:
  typeof p === "object"
    ? p.inn || ""
    : "",
        birth_date: typeof p === "object" ? p.birth_date || p.date_of_birth || "" : "",
        region: typeof p === "object" ? p.region || "" : "",
        source: doc.file_name || doc._source || "document",
      });
    }

    for (const c of companies) {
      const name =
        typeof c === "string"
          ? c
          : c.name || c.company_name || c.legal_name || c.title || "";

      if (!name) continue;

      const director =
  typeof c === "object"
    ? c.director || c.ceo || c.head || c.representative || ""
    : "";

options.push({
  label: `Организация: ${name}${director ? ` · директор: ${director}` : ""} · ${doc.file_name || "документ заявителя"}`,
  subject_type: "company",
  check_subject: name,
  inn: typeof c === "object" ? c.inn || c.tax_id || "" : "",
  ogrn: typeof c === "object" ? c.ogrn || "" : "",
  ogrnip: typeof c === "object" ? c.ogrnip || "" : "",
  fio: director,
  source: doc.file_name || doc._source || "document",
});
    }
  }

  return options;
}, [lead.name, documents]);
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-md"
      onClick={onClose}
      onDragOver={(e) => e.preventDefault()}
onDrop={(e) => e.preventDefault()}
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
            <h2 className="font-display text-4xl">
  №{lead.lead_number ?? "—"} · {lead.name}
</h2>
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
          <button
  onClick={async () => {
    const confirmed = confirm(
      `Архивировать заявку №${lead.lead_number ?? ""}?`
    );

    if (!confirmed) return;

    const { error } = await supabase
  .from("leads")
  .update({
    archived_at: new Date().toISOString(),
    pipeline_stage: "closed",
    status: "closed",
  })
  .eq("id", lead.id);

if (error) {
  alert("Ошибка архивации: " + error.message);
  return;
}
await supabase
  .from("lead_events")
  .insert({
    lead_id: lead.id,
    type: "archived",
    message: `Заявка №${lead.lead_number} архивирована`,
  });

    alert("Заявка отправлена в архив");
    onClose();
    window.location.reload();
  }}
  className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600 shadow-sm hover:bg-red-50"
>
  Архивировать
</button>
          <button onClick={onClose} className="rounded-2xl border bg-white p-3 shadow-sm hover:bg-secondary" aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border bg-white p-2">
          {([
  ["overview", "Overview"],
  ["cases", "Cases"],
  ["inbox", "Inbox"],
  ["documents", "Documents"],
  ["compliance", "Compliance"],
  ["tasks", "Tasks"],
  ["timeline", "Timeline"],
] as const).map(([tab, label]) => (
  <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={`rounded-xl px-4 py-2 text-sm hover:bg-secondary ${
      activeTab === tab
        ? "bg-neutral-950 text-white"
        : "text-muted-foreground"
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
        {activeTab === "cases" && <LeadCases leadId={lead.id} />}
{activeTab === "documents" && (
     <>
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

  await uploadDocuments(files);

  e.target.value = "";
}}
/>
          
    </label>
  </div>
  <div
  className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground transition-colors hover:border-blue-300 hover:bg-blue-50"
  onDragEnter={(e) => {
    e.preventDefault();
    e.stopPropagation();
  }}
  onDragOver={(e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }}
  onDrop={async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files || []);

    if (files.length === 0) {
      alert("Файл не найден");
      return;
    }

    await uploadDocuments(files);
  }}
>
  Перетащите документы сюда
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
        className="rounded-2xl border bg-white p-4"
      >
        <div className="min-w-0">
  <div className="truncate text-sm font-medium" title={doc.file_name || doc.file_url?.split("/").pop()}>
    {doc.file_name || doc.file_url?.split("/").pop()}
  </div>

          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(doc.created_at).toLocaleDateString("ru-RU")}
          </div>
          {doc.analysis_status === "completed" && (
  <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
    <div className="text-xs font-medium text-blue-900">
      Тип: {doc.document_type || "document"}
    </div>

    <div className="mt-2 text-xs text-muted-foreground">
      Анализ выполнен
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] text-blue-700">
        AI обработан
      </span>

      {doc.ai_risks?.length > 0 && (
        <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] text-red-700">
          Рисков: {doc.ai_risks.length}
        </span>
      )}
    </div>
  </div>
)}

  

    
        </div>
<div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
  <button
    onClick={async () => {
  const bucket =
    doc._source === "telegram_attachment"
      ? "communication-attachments"
      : "lead-documents";

  const path =
    doc._source === "telegram_attachment"
      ? doc.storage_path
      : doc.file_url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }

  if (data?.signedUrl) {
    setPreviewUrl(data.signedUrl);
    setPreviewName(
      doc.file_name ||
      path.split("/").pop() ||
      "Документ"
    );
  }
}}
    className="rounded-xl border px-3 py-2 text-xs hover:bg-secondary"
  >
    Открыть
  </button>

  <button
    disabled={analyzingId === doc.id}
    onClick={async () => {
      if (
  doc.analysis_status === "completed" &&
  expandedAnalysisId === doc.id
) {
  setExpandedAnalysisId(null);
  return;
}

if (
  doc.analysis_status === "completed" &&
  expandedAnalysisId !== doc.id
) {
  setAnalysisDoc(doc);
  setExpandedAnalysisId(doc.id);
  return;
}
      try {
        setAnalyzingId(doc.id);

        const { error } = await supabase.functions.invoke(
          "analyze-lead-document",
          {
            body: {
  document_id: doc.id,
  lead_id: lead.id,
  crm_lead_id: lead.source_crm_lead_id ?? null,
},
          }
        );

        if (error) {
          console.error(error);
          alert(error.message);
          return;
        }
await supabase
  .from("lead_events")
  .insert({
    lead_id: lead.id,
    type: "ai_analysis",
    message: `AI анализ выполнен: ${doc.file_name}`,
  });
        const freshDocs = await loadDocuments();
const freshDoc = freshDocs.find((d) => d.id === doc.id);

if (freshDoc) {
  setAnalysisDoc(freshDoc);
  setExpandedAnalysisId(doc.id);
}

alert("AI анализ завершен");
      } finally {
        setAnalyzingId(null);
      }
    }}
    className="rounded-xl border border-blue-200 px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {analyzingId === doc.id
  ? "Анализ..."
  : expandedAnalysisId === doc.id
    ? "Скрыть AI анализ"
    : doc.analysis_status === "completed"
      ? "Посмотреть AI анализ"
      : "Выполнить AI анализ"}
  </button>
<button
  disabled={reviewingId === doc.id}
  onClick={async () => {

    const existingReview =
      legalReviewsByDocumentId[doc.id];

    if (existingReview) {
  setExpandedReviewId(
    expandedReviewId === doc.id ? null : doc.id
  );
  setExpandedAnalysisId(doc.id);
  setAnalysisDoc(doc);
  return;
}

    try {
      setReviewingId(doc.id);

      const { data, error } = await supabase.functions.invoke(
        "legal-document-review-orchestrator",
        {
          body: {
            document_id: doc.id,
          },
        }
      );

      if (error) {
        console.error(error);
        alert(error.message);
        return;
      }
    
      await supabase
        .from("lead_events")
        .insert({
          lead_id: lead.id,
          type: "legal_review",
          message: `Юридическая проверка выполнена: ${doc.file_name}`,
        });
await loadDocuments();
await loadEvents();
await new Promise((resolve) => setTimeout(resolve, 1200));

const { data: freshReview } = await supabase
  .from("legal_document_reviews")
  .select("*")
  .eq("document_id", doc.id)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (freshReview) {
  setLegalReviewsByDocumentId((prev) => ({
    ...prev,
    [doc.id]: freshReview,
  }));

  setExpandedReviewId(doc.id);
setExpandedAnalysisId(doc.id);
setAnalysisDoc(doc);
} else {
  alert("Заключение пока не найдено. Повторите через несколько секунд.");
  return;
}
      alert(
        data?.review_status === "failed"
          ? "Проверка запущена, но завершилась с ошибкой. Можно повторить позже."
          : "Юридическая проверка завершена"
      );
    } catch (e: any) {
  console.error(e);
  alert(e.message ?? "Ошибка юридической проверки");
} finally {
  setReviewingId(null);
}
  }}
  className="rounded-xl border border-green-200 px-3 py-2 text-xs text-green-700 hover:bg-green-50"
>
  {reviewingId === doc.id
  ? "Формирование..."
  : legalReviewsByDocumentId[doc.id]
    ? expandedReviewId === doc.id
      ? "Скрыть заключение"
      : "Посмотреть заключение"
    : "Сформировать заключение"}
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
await supabase
  .from("lead_events")
  .insert({
    lead_id: lead.id,
    type: "document_deleted",
    message: `Удален документ: ${doc.file_name}`,
  });
      await loadDocuments();
    }}
    className="rounded-xl border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
  >
    Удалить
  </button>

</div>

{expandedAnalysisId === doc.id &&
 analysisDoc?.id === doc.id && (
  <div className="mt-4 space-y-4 rounded-2xl border bg-secondary/20 p-4">
    {(() => {
      const a = analysisDoc.extracted_data?.structured_analysis || {};
const review = legalReviewsByDocumentId[doc.id];
      const renderList = (title: string, items: any, red = false) => {
        const arr = Array.isArray(items) ? items : items ? [items] : [];

        return (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </div>

            <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              {arr.length > 0 ? (
                arr.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-2 py-1 ${
                      red ? "bg-red-50 text-red-700" : "bg-secondary/40"
                    }`}
                  >
                    {typeof item === "string"
                      ? item
                      : Object.entries(item)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                  </div>
                ))
              ) : (
                <div>Не найдено</div>
              )}
            </div>
          </div>
        );
      };

      return (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-900">
              Краткое содержание
            </div>

            <div className="mt-2 text-sm leading-6 text-blue-950">
              {a.short_summary ||
                analysisDoc.ai_summary ||
                "Краткое содержание пока не сформировано"}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {renderList("Категория", a.document_category)}
            {renderList("Стороны", a.parties)}
            {renderList("Физлица", a.persons)}
            {renderList("Компании", a.companies)}
            {renderList("Адреса", a.addresses)}
            {renderList("Суммы", a.amounts)}
            {renderList("Даты", a.dates)}
            {renderList("Кадастровые номера", a.cad_numbers)}
          </div>

          <div className="grid gap-3">
            {renderList("Юридические риски", a.legal_risks, true)}
            {renderList("Что проверить юристу", a.missing_checks, true)}
            {renderList("Рекомендации", a.recommended_actions)}
          </div>
          {expandedReviewId === doc.id &&
 legalReviewsByDocumentId[doc.id] && (
  <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
    {(() => {
      const review = legalReviewsByDocumentId[doc.id];

      const renderReviewList = (title: string, items: any, red = false) => {
        const arr = Array.isArray(items) ? items : items ? [items] : [];

        return (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {title}
            </div>

            <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
              {arr.length > 0 ? (
                arr.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-2 py-1 ${
                      red ? "bg-red-50 text-red-700" : "bg-secondary/40"
                    }`}
                  >
                    {typeof item === "string"
                      ? item
                      : Object.entries(item)
                          .filter(([, v]) => v)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                  </div>
                ))
              ) : (
                <div>Не найдено</div>
              )}
            </div>
          </div>
        );
      };

      return (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-green-900">
                Юридическое заключение
              </div>

              <div className="mt-2 text-sm leading-6 text-green-950">
                {review.summary || "Краткий вывод не сформирован"}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-white px-2 py-1 text-[11px] uppercase text-green-800">
                risk: {review.risk_level || "unknown"}
              </span>

              <span className="rounded-full bg-white px-2 py-1 text-[11px] uppercase text-green-800">
                verification: {review.verification_status || "unknown"}
              </span>
            </div>
          </div>

          {review.verification_status === "needs_human_review" && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
              ⚠ Требуется ручная проверка юристом. Система обнаружила противоречие между документом, юридическим выводом или нормативной базой.
            </div>
          )}

          <div className="mt-4 grid gap-3">
            {renderReviewList("Выводы", review.findings)}
            {renderReviewList("Нормы / основания", review.legal_basis)}
            {renderReviewList("Рекомендации юриста", review.recommended_actions)}
            {renderReviewList("Алерты проверки", review.verification_alerts, true)}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-green-900">
            <span className="rounded-full bg-white px-2 py-1">
              status: {review.review_status || "unknown"}
            </span>

            <span className="rounded-full bg-white px-2 py-1">
              verification: {review.verification_status || "unknown"}
            </span>

            <span className="rounded-full bg-white px-2 py-1">
              запусков: {review.run_count ?? 0}
            </span>
          </div>
        </>
      );
    })()}
  </div>
)}
        </>
      );
    })()}
  </div>
)}

</div>

    ))
  )}
</div>
       
</section>
<GeneratedDocumentsBlock
  leadId={lead.id}
  crmLeadId={lead.source_crm_lead_id ?? null}
  userId={session?.user?.id ?? null}
/>
</>
)}
        {activeTab === "compliance" && (
  <section className="mt-8 rounded-3xl border bg-white p-6">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="font-medium">Compliance-проверка</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Проверка ФНС, ФССП, Федресурс, Минюст
        </p>
      </div>

      <button
        disabled={complianceRunning}
        onClick={async () => {
          try {
            setComplianceRunning(true);

            const { data, error } = await supabase.functions.invoke(
              "compliance-check-orchestrator",
              {
                body: {
                  lead_id: lead.id,
                  client_id: null,
                  subject_type: complianceForm.subject_type,
                  check_subject: complianceForm.check_subject,
                  inn: complianceForm.inn || null,
                  ogrn: complianceForm.ogrn || null,
                  ogrnip: complianceForm.ogrnip || null,
                  fio: complianceForm.fio || null,
                  birth_date: complianceForm.birth_date || null,
                  region: complianceForm.region || null,
                },
              }
            );

            if (error) {
  console.error("COMPLIANCE EDGE ERROR:", error);

  alert(
    JSON.stringify(
      {
        message: error.message,
        name: error.name,
        context: (error as any).context,
      },
      null,
      2,
    ),
  );

  return;
}

console.log("COMPLIANCE EDGE DATA:", data);

          /*
await supabase.from("lead_events").insert({
  lead_id: lead.id,
  type: "compliance_check",
  message: `Compliance-проверка создана: ${data?.compliance_check_id ?? ""}`,
});
*/
            await loadComplianceChecks();
            alert("Compliance-проверка создана");
          } finally {
            setComplianceRunning(false);
          }
        }}
        className="rounded-xl bg-neutral-950 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {complianceRunning ? "Проверка..." : "AI Проверить"}
      </button>
    </div>
<label className="mt-6 block">
  <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
    Кого проверить
  </span>

  <select
    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
    defaultValue=""
    onChange={(e) => {
      const idx = Number(e.target.value);
      const selected = complianceSubjectOptions[idx];

      if (!selected) return;
     setSelectedComplianceSubjectType(selected.subject_type);
      setComplianceForm((f) => ({
        ...f,
        subject_type: selected.subject_type,
        check_subject: selected.check_subject,
        fio: selected.fio || "",
        inn: selected.inn || "",
        ogrn: selected.ogrn || "",
        ogrnip: selected.ogrnip || "",
        birth_date: selected.birth_date || "",
        region: selected.region || "",
      }));
    }}
  >
    <option value="">Выбрать из лида / документов</option>

    {complianceSubjectOptions.map((item, idx) => (
      <option key={`${item.source}-${idx}`} value={idx}>
        {item.label}
      </option>
    ))}
  </select>

  {complianceSubjectOptions.length <= 1 && (
    <div className="mt-2 text-xs text-muted-foreground">
      Чтобы появились лица и организации из документов заявителя, сначала выполните AI анализ документа.
    </div>
  )}
</label>
    <div className="mt-6 grid gap-3 md:grid-cols-2">
  {selectedComplianceSubjectType === "company" ? (
    <>
      {[
        ["check_subject", "Наименование организации"],
        ["inn", "ИНН"],
        ["ogrn", "ОГРН"],
        ["ogrnip", "ОГРНИП"],
        ["fio", "ФИО директора / представителя"],
      ].map(([key, label]) => (
        <label key={key} className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <input
            value={(complianceForm as any)[key]}
            onChange={(e) =>
              setComplianceForm((f) => ({ ...f, [key]: e.target.value }))
            }
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
      ))}
    </>
  ) : (
    <>
      {[
        ["fio", "ФИО"],
        ["inn", "ИНН"],
        ["birth_date", "Дата рождения"],
        ["region", "Регион"],
      ].map(([key, label]) => (
        <label key={key} className="block">
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          <input
            value={(complianceForm as any)[key]}
            onChange={(e) =>
              setComplianceForm((f) =>
                key === "fio"
                  ? { ...f, fio: e.target.value, check_subject: e.target.value }
                  : { ...f, [key]: e.target.value },
              )
            }
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none"
          />
        </label>
      ))}
    </>
  )}
</div>

    <div className="mt-6 space-y-3">
      {complianceChecks.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Проверок пока нет
        </div>
      ) : (
        complianceChecks.map((check) => (
          <div key={check.id} className="rounded-2xl border bg-secondary/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  {check.check_subject || "Compliance check"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  status: {check.status} · risk: {check.risk_level || "—"}
                </div>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-muted-foreground">
                {new Date(check.created_at).toLocaleString("ru-RU")}
              </span>
            </div>

            {check.summary && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {check.summary}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {(check.registry_results || []).map((r: any) => (
                <div key={r.source_code} className="rounded-xl bg-white p-3 text-xs">
                  <div className="font-medium">{r.source_name}</div>
                  <div className="mt-1 text-muted-foreground">
                    status: {r.status}
                  </div>
                  {r.lookup_url && (
                    <a
                      href={r.lookup_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-blue-600 underline"
                    >
                      Открыть источник
                    </a>
                  )}
                </div>
              ))}
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
  <section className="mt-8 rounded-3xl border bg-white p-6">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-medium">Timeline</h3>

      <button
        onClick={loadEvents}
        className="rounded-xl border px-3 py-2 text-xs hover:bg-secondary"
      >
        Обновить
      </button>
    </div>

    {events.length === 0 ? (
      <div className="mt-5 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Событий пока нет
      </div>
    ) : (
      <div className="mt-6 space-y-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-2xl border bg-secondary/30 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-medium">
                {event.message}
              </div>

              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-muted-foreground">
                {event.type}
              </span>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString("ru-RU")}
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
)}
        {previewUrl && (
  <div className="fixed inset-0 z-[80] overflow-y-auto flex items-center justify-center bg-black/50 p-6">
    <div className="h-[90vh] w-full max-w-5xl rounded-3xl bg-white p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">
          {previewName || "Документ"}
        </div>

        <div className="flex gap-2">
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border px-3 py-2 text-xs hover:bg-secondary"
          >
            Открыть в новой вкладке
          </a>

          <button
            onClick={() => {
              setPreviewUrl(null);
              setPreviewName(null);
            }}
            className="rounded-xl border px-3 py-2 text-xs hover:bg-secondary"
          >
            Закрыть
          </button>
        </div>
      </div>

      {previewUrl?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
  <img
    src={previewUrl}
    alt={previewName || "preview"}
    className="h-[calc(90vh-72px)] w-full rounded-2xl border object-contain bg-black/5"
  />
) : (
  <iframe
    src={previewUrl}
    className="h-[calc(90vh-72px)] w-full rounded-2xl border"
    title={previewName || "Document preview"}
  />
)}
    </div>
  </div>
)}
      </aside>
    </div>
  );
}
function LeadCases({ leadId }: { leadId: string }) {
  console.log("LeadCases leadId =", leadId);
  const [cases, setCases] = useState<any[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const loadCases = useCallback(async () => {
    setLoadingCases(true);

    const { data, error } = await supabase
      .from("legal_cases")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Ошибка загрузки дел: " + error.message);
      setLoadingCases(false);
      return;
    }

    setCases(data || []);
    setLoadingCases(false);
  }, [leadId]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  return (
    <section className="mt-8 rounded-3xl border bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Дела клиента</h3>

        <button
          onClick={async () => {
            const title = prompt("Название дела", "Новое дело");
            if (!title) return;

            const { error } = await supabase
  .from("legal_cases")
  .insert({
    lead_id: leadId,
    title,
    status: "new",
    priority: "normal",
  });

if (error) {
  console.error(error);
  alert("Ошибка создания дела: " + error.message);
  return;
}

await supabase
  .from("lead_events")
  .insert({
    lead_id: leadId,
    type: "case_created",
    message: `Создано дело: ${title}`,
  });

            await loadCases();
          }}
          className="rounded-xl bg-neutral-950 px-4 py-2 text-xs text-white hover:bg-neutral-800"
        >
          Создать дело
        </button>
      </div>

      {loadingCases ? (
        <div className="mt-5 text-sm text-muted-foreground">
          Загрузка дел…
        </div>
      ) : cases.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Дел пока нет. Нажмите «Создать дело».
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {cases.map((item) => (
  <button
    key={item.id}
    type="button"
    onClick={() => {
  setSelectedCase(item);
}}
    className="w-full rounded-2xl border bg-secondary/30 p-4 text-left transition hover:border-neutral-400 hover:bg-secondary/50"
  >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {item.title}
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {item.case_type || "Тип дела не указан"}
                  </div>
                </div>

                <span className="rounded-full bg-white px-3 py-1 text-xs text-muted-foreground">
                  {item.status || "new"}
                </span>
              </div>

              {item.description && (
                <div className="mt-3 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {item.case_number && (
                  <span className="rounded-full bg-white px-2 py-1">
                    № {item.case_number}
                  </span>
                )}

                {item.court_name && (
                  <span className="rounded-full bg-white px-2 py-1">
                    {item.court_name}
                  </span>
                )}

                {item.claim_amount && (
                  <span className="rounded-full bg-white px-2 py-1">
                    Сумма: {item.claim_amount}
                  </span>
                )}
              </div>
            </button>
          ))}
                </div>
      )}

      {selectedCase && (
        <div className="mt-6 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between gap-3">
  <h4 className="text-lg font-semibold">
    {selectedCase.title}
  </h4>

  <div className="flex items-center gap-2">
    <span className="rounded-full bg-secondary px-3 py-1 text-xs">
      {selectedCase.status || "new"}
    </span>
<button
  type="button"
  onClick={async () => {
    const courtName = prompt(
      "Суд",
      selectedCase.court_name || ""
    );

    const courtCaseNumber = prompt(
      "Номер дела",
      selectedCase.court_case_number || ""
    );

    const opponentName = prompt(
      "Оппонент",
      selectedCase.opponent_name || ""
    );

    const claimAmount = prompt(
      "Сумма требований",
      String(selectedCase.claim_amount || "")
    );

    const { error } = await supabase
      .from("legal_cases")
      .update({
        court_name: courtName || null,
        court_case_number: courtCaseNumber || null,
        opponent_name: opponentName || null,
        claim_amount: claimAmount
          ? Number(claimAmount)
          : null,
      })
      .eq("id", selectedCase.id);

    if (error) {
      alert("Ошибка обновления дела: " + error.message);
      return;
    }

    await loadCases();

    const { data } = await supabase
      .from("legal_cases")
      .select("*")
      .eq("id", selectedCase.id)
      .single();

    if (data) {
      setSelectedCase(data);
    }
  }}
  className="rounded-full border px-3 py-1 text-xs hover:bg-secondary"
>
  Редактировать
</button>
    <button
      type="button"
      onClick={async () => {
        const confirmed = confirm("Удалить это дело?");
        if (!confirmed) return;

        const { error } = await supabase
          .from("legal_cases")
          .delete()
          .eq("id", selectedCase.id);

        if (error) {
          console.error(error);
          alert("Ошибка удаления дела: " + error.message);
          return;
        }

        setSelectedCase(null);
        await loadCases();
      }}
      className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
    >
      Удалить
    </button>
  </div>
</div>

          <div className="mt-4 text-sm text-muted-foreground">
            Тип дела: {selectedCase.case_type || "Не указан"}
          </div>
<div className="mt-4 rounded-xl bg-secondary/30 p-4">
  <div className="font-medium">Документы дела</div>

  <div className="mt-2 text-sm text-muted-foreground">
    Пока нет прикреплённых документов
  </div>
</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
  <div className="rounded-xl border bg-white p-3">
    <div className="text-xs text-muted-foreground">Суд</div>
    <div className="mt-1">{selectedCase.court_name || "Не указан"}</div>
  </div>

  <div className="rounded-xl border bg-white p-3">
    <div className="text-xs text-muted-foreground">Номер дела</div>
    <div className="mt-1">{selectedCase.court_case_number || "Не указан"}</div>
  </div>

  <div className="rounded-xl border bg-white p-3">
    <div className="text-xs text-muted-foreground">Оппонент</div>
    <div className="mt-1">{selectedCase.opponent_name || "Не указан"}</div>
  </div>

  <div className="rounded-xl border bg-white p-3">
    <div className="text-xs text-muted-foreground">Сумма требований</div>
    <div className="mt-1">{selectedCase.claim_amount || "Не указана"}</div>
  </div>
</div>
          {selectedCase.ai_summary && (
            <div className="mt-4 rounded-xl bg-secondary/40 p-4 text-sm">
              {selectedCase.ai_summary}
            </div>
          )}
        </div>
      )}
    </section>
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
    <div className="rounded-2xl border border-white/40 bg-white/30 p-6 shadow-[0_8px_32px_rgba(15,30,55,0.12)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <Icon size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-4 text-3xl font-display">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-[11px] text-muted-foreground/80">{sub}</div>
    </div>
  );
}
