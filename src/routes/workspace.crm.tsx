import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";

export const Route = createFileRoute("/workspace/crm")({
  component: CRMPage,
});

const columns = [
  { id: "new", label: "NEW", dot: "bg-blue-500" },
  { id: "contacted", label: "CONTACTED", dot: "bg-cyan-500" },
  { id: "waiting_documents", label: "WAITING DOCUMENTS", dot: "bg-amber-500" },
  { id: "analysis", label: "ANALYSIS", dot: "bg-violet-500" },
  { id: "offer_sent", label: "OFFER SENT", dot: "bg-blue-600" },
  { id: "in_work", label: "IN WORK", dot: "bg-green-500" },
  { id: "court", label: "COURT", dot: "bg-red-500" },
  { id: "closed", label: "CLOSED", dot: "bg-neutral-400" },
];

const testLeads = [
  { name: "Иван Петров", case: "Проверка квартиры перед покупкой", stage: "new", priority: "urgent", date: "Сегодня" },
  { name: "Мария Соколова", case: "Консультация по мошенничеству", stage: "new", priority: "medium", date: "Сегодня" },
  { name: "Алексей Ким", case: "Взыскание долга с физлица", stage: "new", priority: "low", date: "Вчера" },
  { name: "Ольга Власова", case: "Проверка документов на недвижимость", stage: "contacted", priority: "urgent", date: "Сегодня" },
  { name: "Дмитрий Орлов", case: "Раздел имущества после развода", stage: "contacted", priority: "medium", date: "Вчера" },
  { name: "Елена Смирнова", case: "Оформление наследства", stage: "waiting_documents", priority: "medium", date: "2 дня назад" },
  { name: "Сергей Воронов", case: "Регистрация ООО", stage: "waiting_documents", priority: "low", date: "3 дня назад" },
  { name: "Наталья Зайцева", case: "Трудовой спор с работодателем", stage: "analysis", priority: "urgent", date: "Сегодня" },
  { name: "Максим Григорьев", case: "Проверка договора аренды", stage: "analysis", priority: "low", date: "Вчера" },
  { name: "Юлия Белова", case: "Сопровождение сделки купли-продажи", stage: "offer_sent", priority: "medium", date: "2 дня назад" },
  { name: "Андрей Лебедев", case: "Взыскание ущерба с УК", stage: "in_work", priority: "urgent", date: "Сегодня" },
  { name: "Виктория Морозова", case: "Спор о границах участка", stage: "in_work", priority: "medium", date: "Вчера" },
  { name: "Павел Новиков", case: "Представительство в суде по ДТП", stage: "court", priority: "urgent", date: "3 дня назад" },
  { name: "Татьяна Ларина", case: "Успешное взыскание долга", stage: "closed", priority: "low", date: "5 дней назад" },
  { name: "Роман Иванов", case: "Регистрация товарного знака", stage: "closed", priority: "low", date: "Неделю назад" },
];

function priorityClass(priority: string) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "medium") return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

function CRMPage() {
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  return (
    <div className="space-y-6 pb-8">
     <div className="
sticky
top-0
z-20
flex
flex-col
gap-6
bg-[oklch(0.97_0.012_75)]
pb-4
pt-2
xl:flex-row
xl:items-start
xl:justify-between
">
        <div>
          <h1 className="font-display text-4xl leading-tight">Legal CRM</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            AI-assisted legal pipeline
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm text-muted-foreground shadow-sm">
            <Search size={16} />
            Поиск...
          </div>

          <button className="flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm shadow-sm">
            <SlidersHorizontal size={16} />
            Фильтры
          </button>

          <button className="flex h-11 items-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm text-white shadow-sm">
            <Plus size={16} />
            Добавить лид
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white/55 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.03)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 3xl:grid-cols-4">
          {columns.map((column) => {
            const leads = testLeads.filter((lead) => lead.stage === column.id);

            return (
             <section
  key={column.id}
 className="
min-h-[420px]
rounded-2xl
border
border-border/60
bg-white/70
backdrop-blur
p-4
shadow-[0_4px_24px_rgba(0,0,0,0.03)]
"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em]">
                      {column.label}
                    </h2>
                  </div>

                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {leads.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {leads.map((lead) => (
                    <article
  key={lead.name}
  onClick={() => setSelectedLead(lead)}
                     className="
group
cursor-pointer
rounded-2xl
border
border-border/60
bg-white
p-4
shadow-[0_4px_20px_rgba(0,0,0,0.035)]
transition-all
duration-200
hover:-translate-y-1
hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]
"
                    >
                      <h3 className="text-sm font-semibold">{lead.name}</h3>

                      <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-muted-foreground">
                        {lead.case}
                      </p>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] ${priorityClass(lead.priority)}`}>
                          {lead.priority}
                        </span>

                        <span className="text-[11px] text-muted-foreground">
                          {lead.date}
                        </span>
                      </div>
                    </article>
                  ))}

                  <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-white">
                    <Plus size={14} />
                    Добавить лид
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
{selectedLead && (
  <div
    className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-sm"
    onClick={() => setSelectedLead(null)}
  >
    <aside
      onClick={(e) => e.stopPropagation()}
      className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-[oklch(0.98_0.01_75)] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="mb-4 inline-flex rounded-full border border-border bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Legal dossier
          </div>

          <h2 className="font-display text-4xl leading-tight">
            {selectedLead.name}
          </h2>

          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {selectedLead.case}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs ${priorityClass(selectedLead.priority)}`}>
              {selectedLead.priority}
            </span>

            <span className="rounded-full bg-white px-3 py-1 text-xs text-muted-foreground">
              {selectedLead.date}
            </span>
          </div>
        </div>

        <button
          onClick={() => setSelectedLead(null)}
          className="rounded-2xl border border-border bg-white p-3 shadow-sm transition hover:bg-secondary"
        >
          <X size={18} />
        </button>
      </div>
<div className="mt-8 flex gap-2 rounded-2xl border border-border bg-white p-2">
  {[
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents" },
    { id: "tasks", label: "Tasks" },
    { id: "timeline", label: "Timeline" },
  ].map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`
        rounded-xl px-4 py-2 text-sm transition-all
        ${
          activeTab === tab.id
            ? "bg-neutral-950 text-white shadow-sm"
            : "text-muted-foreground hover:bg-secondary"
        }
      `}
    >
      {tab.label}
    </button>
  ))}
</div>
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Stage
          </div>
          <div className="mt-2 text-sm font-medium">
            {selectedLead.stage.replaceAll("_", " ")}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Next step
          </div>
          <div className="mt-2 text-sm font-medium">
            Проверка документов
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Value
          </div>
          <div className="mt-2 text-sm font-medium">
            75 000 ₽
          </div>
        </div>
      </div>
{activeTab === "overview" && (
      <div className="mt-8 rounded-3xl border border-border bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <AlertTriangle size={17} />
          <h3 className="font-medium">AI Risk Analysis</h3>
        </div>

        <div className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
          <p>Рекомендуется проверить документы, ограничения, собственника и историю объекта.</p>
          <p>Следующий шаг — запросить выписку ЕГРН и документы-основания права.</p>
        </div>
      </div>
)}
      {activeTab === "documents" && (
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <FileText size={17} />
            <h3 className="font-medium">Documents</h3>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-secondary/70 p-4 text-sm">
              Договор.pdf
            </div>
            <div className="rounded-2xl bg-secondary/70 p-4 text-sm">
              Выписка ЕГРН.pdf
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-white p-6">
          <div className="flex items-center gap-2">
            <CheckSquare size={17} />
            <h3 className="font-medium">Tasks</h3>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-border p-4 text-sm">
              Проверить собственника
            </div>
            <div className="rounded-2xl border border-border p-4 text-sm">
              Подготовить заключение
            </div>
          </div>
        </section>
      </div>
  )}

{activeTab === "timeline" && (
  <div className="mt-6 space-y-4">
    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="text-sm font-medium">
        Лид создан
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Сегодня, 12:40
      </div>
    </div>

    <div className="rounded-2xl border border-border bg-white p-5">
      <div className="text-sm font-medium">
        Загружены документы
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Сегодня, 13:05
      </div>
    </div>
  </div>
)}

{activeTab === "tasks" && (
  <div className="mt-6 space-y-4">
    <div className="rounded-2xl border border-border bg-white p-5 text-sm">
      Проверить собственника
    </div>

    <div className="rounded-2xl border border-border bg-white p-5 text-sm">
      Подготовить заключение
    </div>
  </div>
)}
    </aside>
  </div>
)}
        <Kpi icon={Users} value="15" label="Всего лидов" sub="+12% за неделю" />
        <Kpi icon={Clock} value="4" label="В работе" sub="+2 за неделю" />
        <Kpi icon={CheckCircle2} value="8" label="Завершено" sub="+25% за неделю" />
        <Kpi icon={TrendingUp} value="73%" label="Конверсия" sub="+8% за неделю" />
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
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
          <Icon size={22} />
        </div>

        <div>
          <div className="font-display text-3xl">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-green-600">{sub}</div>
    </div>
  );
}
